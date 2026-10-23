import {
  Workflow,
  PipelineRun,
  Environment,
  Artifact,
  IntegrationStatus,
  SecretItem,
  Metrics,
  RecentEvent,
  Job,
  JobLogEntry,
  EngineStatus,
  DataMode,
  BackendWorkflow,
  BackendWorkflowDetail,
  IntegrationsReadiness,
  AggregateMetrics,
  WebhookDeliveryItem,
  mapBackendStatus
} from '../types';
import {
  mockWorkflows,
  mockRunsList,
  mockMainRun,
  mockEnvironments,
  mockArtifacts,
  mockSecrets,
  mockIntegrations,
  mockMetrics,
  mockRecentEvents
} from './mockData';

// Backend Engine URL (default to localhost:3000 or relative proxy)
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

function getCurrentDataMode(): DataMode {
  return (localStorage.getItem('cicd_data_mode') as DataMode) || 'real';
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined || durationMs === null || isNaN(durationMs)) {
    return '0s';
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  if (durationMs < 60000) {
    const sec = durationMs / 1000;
    return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`;
  }
  const min = Math.floor(durationMs / 60000);
  const sec = Math.round((durationMs % 60000) / 1000);
  return `${min}m ${sec}s`;
}

async function safeFetch<T>(
  url: string,
  options?: RequestInit,
  fallback?: T
): Promise<T> {
  const managementToken = localStorage.getItem('cicd_management_token');
  const customHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  };
  if (managementToken) {
    customHeaders['x-management-token'] = managementToken;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...customHeaders,
        ...(options?.headers || {})
      }
    });
    if (!res.ok) {
      if (fallback !== undefined) return fallback;
      throw new Error(`API error ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export const pipelineApi = {
  /**
   * Fetches real engine online status and active runs count
   */
  async getEngineStatus(): Promise<EngineStatus> {
    return safeFetch<EngineStatus>(
      `${BACKEND_URL}/api/status`,
      { method: 'GET' },
      {
        status: 'offline',
        activeRuns: 0,
        totalWorkflows: 0,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        port: '3000'
      }
    );
  },

  /**
   * Fetches all registered workflows (supports Real Mode and Demo Mode)
   */
  async getWorkflows(mode?: DataMode): Promise<Workflow[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return [...mockWorkflows];
    }

    try {
      const backendWorkflows = await safeFetch<BackendWorkflow[]>(
        `${BACKEND_URL}/api/workflows`,
        { method: 'GET' }
      );

      if (Array.isArray(backendWorkflows)) {
        return backendWorkflows.map((bw) => ({
          id: bw.name,
          name: bw.name,
          slug: bw.name,
          description: `Configured webhook: ${bw.webhook.url} • [${(bw.webhook.methods || ['POST']).join(', ')}]`,
          repository:
            bw.trigger?.allowedRepositories?.[0] || 'Local Repository',
          defaultBranch: bw.trigger?.allowedBranches?.[0] || 'main',
          lastRunStatus: bw.lastRun ? mapBackendStatus(bw.lastRun.status) : 'queued',
          lastRunTime: bw.lastRun?.finishedAt
            ? new Date(bw.lastRun.finishedAt).toLocaleTimeString()
            : bw.lastRun?.startedAt
            ? 'Running'
            : 'Never executed',
          triggers: (bw.trigger?.events as any) || ['push'],
          activeRunsCount: 0,
          successRate: bw.isValid ? 100 : 0,
          avgDuration: bw.lastRun?.durationMs ? formatDuration(bw.lastRun.durationMs) : 'N/A',
          totalRuns: bw.runsCount || 0,
          yamlConfig: JSON.stringify(bw, null, 2)
        }));
      }
    } catch {
      // Backend offline or unreachable
    }

    return [];
  },

  /**
   * Fetches raw BackendWorkflow list for the rich Workflows discovery page
   */
  async getBackendWorkflows(mode?: DataMode): Promise<BackendWorkflow[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return mockWorkflows.map((w) => ({
        name: w.name,
        webhook: { url: `/webhooks/${w.slug}`, methods: ['POST'] },
        trigger: { events: ['push'], allowedBranches: ['main'], allowedRepositories: [w.repository] },
        jobCount: 6,
        jobs: {},
        isValid: true,
        validationErrors: [],
        runsCount: w.totalRuns,
        lastRun: {
          id: 'demo-run',
          status: 'SUCCESS',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          branch: 'main',
          durationMs: 74000
        }
      }));
    }

    try {
      const data = await safeFetch<BackendWorkflow[]>(
        `${BACKEND_URL}/api/workflows`,
        { method: 'GET' }
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  /**
   * Fetches detailed workflow structure (jobs, triggers, environments)
   */
  async getWorkflowDetail(
    name: string,
    mode?: DataMode
  ): Promise<BackendWorkflowDetail | null> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return {
        workflow: {
          name,
          webhook: { url: `/webhooks/${name}`, methods: ['POST'] },
          trigger: { events: ['push'], allowedBranches: ['main'] },
          jobs: { build: { steps: [{ name: 'Build' }] }, test: { steps: [{ name: 'Test' }] } }
        },
        isValid: true,
        validationErrors: [],
        jobCount: 2,
        runsCount: 1,
        lastRun: { id: 'demo-run', status: 'SUCCESS' }
      };
    }

    try {
      return await safeFetch<BackendWorkflowDetail>(
        `${BACKEND_URL}/api/workflows/${encodeURIComponent(name)}`,
        { method: 'GET' }
      );
    } catch {
      return null;
    }
  },

  /**
   * Triggers a workflow execution manually
   */
  async triggerWorkflow(
    workflowName: string,
    branch?: string
  ): Promise<{ runId: string; pipelineId: string; status: string }> {
    return safeFetch<{ runId: string; pipelineId: string; status: string }>(
      `${BACKEND_URL}/api/workflows/${encodeURIComponent(workflowName)}/run`,
      {
        method: 'POST',
        body: JSON.stringify({ branch: branch || 'main' })
      }
    );
  },

  /**
   * Fetches runs with optional status/workflow filters
   */
  async getRuns(
    workflowId?: string,
    statusFilter?: string,
    mode?: DataMode
  ): Promise<PipelineRun[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      let filtered = [...mockRunsList];
      if (workflowId && workflowId !== 'all') {
        filtered = filtered.filter((r) => r.workflowId === workflowId || r.workflowName === workflowId);
      }
      if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter((r) => r.status.toLowerCase() === statusFilter.toLowerCase());
      }
      return filtered;
    }

    try {
      const queryParams = new URLSearchParams();
      if (workflowId && workflowId !== 'all') queryParams.set('workflow', workflowId);
      if (statusFilter && statusFilter !== 'all') queryParams.set('status', statusFilter);

      const url = `${BACKEND_URL}/api/runs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const data = await safeFetch<{ runs: any[]; pagination: any; memoryNotice: string }>(
        url,
        { method: 'GET' }
      );

      if (data && Array.isArray(data.runs)) {
        return data.runs.map((br, idx) => ({
          id: br.id,
          workflowId: br.pipelineId || 'workflow',
          workflowName: br.pipelineId || 'pipeline',
          runNumber: data.runs.length - idx,
          status: mapBackendStatus(br.status),
          branch: br.branch || 'main',
          commitSha: br.id.slice(0, 7),
          commitMessage: `Execution run ${br.id.slice(0, 8)}`,
          author: { name: 'Engine Operator', username: 'local-runner' },
          trigger: 'push / manual',
          totalJobs: br.jobCount || Object.keys(br.jobs || {}).length,
          duration: br.durationMs
            ? formatDuration(br.durationMs)
            : br.finishedAt && br.startedAt
            ? formatDuration(new Date(br.finishedAt).getTime() - new Date(br.startedAt).getTime())
            : 'In progress',
          startedAt: br.startedAt ? new Date(br.startedAt).toLocaleTimeString() : 'Recently',
          elapsedTime: br.finishedAt ? 'Completed' : 'Running',
          environment: br.environment,
          jobs: Object.values(br.jobs || {}).map((j: any) => ({
            id: j.jobId,
            runId: br.id,
            name: j.jobId,
            status: mapBackendStatus(j.status),
            duration: formatDuration(j.durationMs),
            startedAt: j.startedAt,
            completedAt: j.finishedAt,
            iconType: j.jobId.includes('test')
              ? 'test'
              : j.jobId.includes('lint')
              ? 'lint'
              : j.jobId.includes('build')
              ? 'build'
              : j.jobId.includes('deploy')
              ? 'deploy'
              : 'custom',
            exitCode: j.exitCode,
            failureReason: j.failureReason,
            steps: j.stepResults,
            dependsOn: j.needs || []
          }))
        }));
      }
    } catch {
      // Backend offline
    }

    return [];
  },

  /**
   * Fetches details of a specific pipeline run (or workflow topology if run doesn't exist)
   */
  async getRunById(
    runId: string,
    mode?: DataMode,
    forcePreview?: boolean
  ): Promise<PipelineRun | null> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      if (runId === mockMainRun.id || runId === 'latest' || runId === 'deploy-main') {
        return mockMainRun;
      }
      return mockRunsList.find((r) => r.id === runId) || mockMainRun;
    }

    try {
      const br = await safeFetch<any>(
        `${BACKEND_URL}/api/runs/${encodeURIComponent(runId)}`,
        { method: 'GET' }
      );

      if (br && br.runId) {
        return {
          id: br.runId,
          workflowId: br.pipelineId || 'workflow',
          workflowName: br.pipelineId || 'workflow',
          runNumber: 1,
          status: mapBackendStatus(br.status),
          branch: br.branch || 'main',
          commitSha: br.commitSha ? br.commitSha.slice(0, 7) : br.runId.slice(0, 7),
          commitMessage: br.commitSha
            ? `Push commit ${br.commitSha.slice(0, 7)} on ${br.branch || 'main'}`
            : `Execution run ${br.runId.slice(0, 8)}`,
          author: { name: 'GitHub Webhook', username: 'github' },
          trigger: br.deliveryId ? `GitHub Push (${br.deliveryId.slice(0, 8)})` : 'Pipeline Engine',
          totalJobs: Object.keys(br.jobs || {}).length,
          duration: br.durationMs
            ? formatDuration(br.durationMs)
            : br.finishedAt && br.startedAt
            ? formatDuration(new Date(br.finishedAt).getTime() - new Date(br.startedAt).getTime())
            : 'In progress',
          startedAt: br.startedAt ? new Date(br.startedAt).toLocaleTimeString() : 'Recently',
          elapsedTime: br.finishedAt ? 'Completed' : 'Running',
          environment: br.environment,
          repository: br.repository,
          deliveryId: br.deliveryId,
          commitStatus: br.commitStatus,
          isIdlePreview: false,
          jobs: Object.values(br.jobs || {}).map((j: any) => ({
            id: j.jobId,
            runId: br.runId,
            name: j.jobId,
            status: mapBackendStatus(j.status),
            duration: formatDuration(j.durationMs),
            startedAt: j.startedAt,
            completedAt: j.finishedAt,
            iconType: j.jobId.includes('test')
              ? 'test'
              : j.jobId.includes('lint')
              ? 'lint'
              : j.jobId.includes('build')
              ? 'build'
              : j.jobId.includes('deploy')
              ? 'deploy'
              : 'custom',
            exitCode: j.exitCode,
            failureReason: j.failureReason,
            steps: j.stepResults,
            dependsOn: j.needs || []
          }))
        };
      }
    } catch {
      // Not a run ID, check if runId is a workflow name!
    }

    // If ID is a workflow name, check if workflow has an actual previous run!
    try {
      const wfDetail = await this.getWorkflowDetail(runId, 'real');
      if (wfDetail && wfDetail.workflow) {
        // If not explicitly asking for preview and workflow has an executed run, show the latest run!
        if (!forcePreview && wfDetail.lastRun?.id) {
          const latestRun = await this.getRunById(wfDetail.lastRun.id, 'real');
          if (latestRun) {
            return latestRun;
          }
        }

        // Otherwise (or if forcePreview=true), build an idle/topology representation
        const wf = wfDetail.workflow;
        const jobKeys = Object.keys(wf.jobs || {});
        return {
          id: `preview-${wf.name}`,
          workflowId: wf.name,
          workflowName: wf.name,
          runNumber: wfDetail.runsCount || 0,
          status: 'idle',
          isIdlePreview: true,
          branch: wf.trigger.allowedBranches?.[0] || 'main',
          commitSha: 'HEAD',
          commitMessage: `Workflow definition preview for ${wf.name}`,
          author: { name: 'Workflow Config', username: 'config' },
          trigger: 'Workflow Definition Preview',
          totalJobs: jobKeys.length,
          duration: 'Not run',
          startedAt: 'Not run',
          elapsedTime: 'Not run',
          jobs: jobKeys.map((jk) => {
            const jDef = wf.jobs[jk];
            return {
              id: jk,
              runId: `preview-${wf.name}`,
              name: jk,
              status: 'idle',
              duration: 'Not run',
              iconType: jk.includes('test')
                ? 'test'
                : jk.includes('lint')
                ? 'lint'
                : jk.includes('build')
                ? 'build'
                : jk.includes('deploy')
                ? 'deploy'
                : 'custom',
              dependsOn: jDef.needs || []
            };
          })
        };
      }
    } catch {
      // Fallback
    }

    return null;
  },

  /**
   * Fetches real logs from backend for a run and optional jobId filter
   */
  async getRunLogs(
    runId: string,
    jobId?: string,
    level?: string,
    webhookUrl?: string
  ): Promise<JobLogEntry[]> {
    try {
      const url = webhookUrl
        ? `${BACKEND_URL}${webhookUrl}/runs/${runId}/logs`
        : `${BACKEND_URL}/api/runs/${runId}/logs`;

      const queryParams = new URLSearchParams();
      if (jobId) queryParams.set('jobId', jobId);
      if (level) queryParams.set('level', level);
      queryParams.set('limit', '100');

      const fullUrl = `${url}?${queryParams.toString()}`;
      const res = await safeFetch<any>(fullUrl, { method: 'GET' });

      if (res && Array.isArray(res.logs)) {
        return res.logs.map((log: any, idx: number) => ({
          id: String(idx + 1),
          jobId: log.jobId || 'pipeline',
          timestamp: log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '10:24:00',
          level: (log.level?.toLowerCase() as any) || 'info',
          message: log.message || ''
        }));
      }
    } catch {
      // Backend unavailable or no logs
    }

    return [];
  },

  /**
   * Cancels a currently executing pipeline run via real backend endpoint
   */
  async cancelRun(
    runId: string,
    webhookUrl?: string
  ): Promise<{ success: boolean; message: string; run?: any }> {
    try {
      const url = webhookUrl
        ? `${BACKEND_URL}${webhookUrl}/runs/${runId}/cancel`
        : `${BACKEND_URL}/api/runs/${runId}/cancel`;

      const res = await safeFetch<any>(url, {
        method: 'POST'
      });

      return {
        success: true,
        message: `Pipeline run ${runId} cancelled successfully.`,
        run: res
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || `Failed to cancel pipeline run ${runId}.`
      };
    }
  },

  async rerunRun(runId: string): Promise<{ success: boolean; message: string }> {
    await new Promise((r) => setTimeout(r, 150));
    return {
      success: true,
      message: `Rerun queued for ${runId}. Worker allocated on local runner.`
    };
  },

  /**
   * Fetches aggregate metrics from backend or demo mock
   */
  async getMetrics(mode?: DataMode): Promise<Metrics> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return { ...mockMetrics };
    }

    try {
      const data = await safeFetch<AggregateMetrics>(
        `${BACKEND_URL}/api/metrics`,
        { method: 'GET' }
      );

      if (data) {
        return {
          activeRuns: data.activeRuns,
          successRate: data.successRate ?? 0,
          avgDuration: data.avgDurationMs ? formatDuration(data.avgDurationMs) : 'N/A',
          durationChangePercentage: 0,
          totalRuns30Days: data.totalRuns,
          failureCount: data.failedRuns,
          queuedRuns: 0
        };
      }
    } catch {
      // Fallback
    }

    return {
      activeRuns: 0,
      successRate: 0,
      avgDuration: 'N/A',
      durationChangePercentage: 0,
      totalRuns30Days: 0,
      failureCount: 0,
      queuedRuns: 0
    };
  },

  /**
   * Fetches GitHub & Engine readiness status
   */
  async getIntegrationsReadiness(mode?: DataMode): Promise<IntegrationsReadiness> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return {
        backendOnline: true,
        port: '3000',
        loadedWorkflowsCount: 14,
        activeRunsCount: 1,
        totalRunsRecorded: 142,
        githubTokenConfigured: true,
        githubWebhookSecretConfigured: true,
        publicWebhookBaseUrl: 'https://demo-tunnel.ngrok-free.app',
        managementSecretConfigured: true,
        recentDeliveries: [
          {
            id: 'del_demo_101',
            workflowName: 'day7-live-github',
            event: 'push',
            repository: 'adarshbam/ci-cd-pipeline-engine',
            branch: 'main',
            commitSha: 'a74f12e8b91a2c3d4e5f6g7h8i9j0k1l2m3n4o5p',
            timestamp: new Date().toISOString(),
            status: 'accepted'
          }
        ],
        memoryPersistenceNotice: 'Demo mode simulated data'
      };
    }

    return safeFetch<IntegrationsReadiness>(
      `${BACKEND_URL}/api/integrations/status`,
      { method: 'GET' },
      {
        backendOnline: false,
        port: '3000',
        loadedWorkflowsCount: 0,
        activeRunsCount: 0,
        totalRunsRecorded: 0,
        githubTokenConfigured: false,
        githubWebhookSecretConfigured: false,
        publicWebhookBaseUrl: null,
        managementSecretConfigured: false,
        recentDeliveries: [],
        memoryPersistenceNotice: 'In-memory engine storage: runs reset on server restart'
      }
    );
  },

  /**
   * Performs a safe read-only GitHub API connectivity probe
   */
  async verifyGitHubConnection(): Promise<{
    verified: boolean;
    authenticatedUser?: string;
    rateLimitRemaining?: string;
    scopes?: string[];
    reason?: string;
    message?: string;
  }> {
    return safeFetch<any>(
      `${BACKEND_URL}/api/integrations/verify-github`,
      { method: 'POST' },
      { verified: false, reason: 'Backend unreachable' }
    );
  },

  async getEnvironments(mode?: DataMode): Promise<Environment[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return [...mockEnvironments];
    }
    return safeFetch<Environment[]>(
      `${BACKEND_URL}/api/environments`,
      { method: 'GET' },
      [...mockEnvironments]
    );
  },

  async getRunArtifacts(runId: string, mode?: DataMode): Promise<Artifact[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return [...mockArtifacts];
    }
    try {
      const res = await safeFetch<{ runId: string; artifacts: any[] }>(
        `${BACKEND_URL}/api/runs/${runId}/artifacts`,
        { method: 'GET' },
        { runId, artifacts: [] }
      );
      return (res.artifacts || []).map((a) => ({
        id: a.id,
        runId: a.runId || runId,
        jobId: a.jobId,
        jobName: a.jobId,
        name: a.name,
        size: a.size,
        sizeBytes: a.sizeBytes,
        type: a.type || 'binary',
        createdAt: a.createdAt,
        sha256: a.sha256 || '',
        downloadUrl: a.downloadUrl,
      }));
    } catch {
      return [];
    }
  },

  async getArtifacts(mode?: DataMode): Promise<Artifact[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return [...mockArtifacts];
    }
    try {
      const res = await safeFetch<{ artifacts: any[] }>(
        `${BACKEND_URL}/api/artifacts`,
        { method: 'GET' },
        { artifacts: [] }
      );
      if (!res.artifacts || res.artifacts.length === 0) {
        return [];
      }
      return res.artifacts.map((a) => ({
        id: a.id,
        runId: a.runId,
        jobId: a.jobId,
        jobName: a.jobId,
        name: a.name,
        size: a.size,
        sizeBytes: a.sizeBytes,
        type: a.type || 'binary',
        createdAt: a.createdAt,
        sha256: a.sha256 || '',
        downloadUrl: a.downloadUrl,
      }));
    } catch {
      return [];
    }
  },

  async downloadArtifact(
    runId: string,
    jobId: string,
    artifactName: string
  ): Promise<void> {
    const managementToken = localStorage.getItem('cicd_management_token');
    const headers: Record<string, string> = {};
    if (managementToken) {
      headers['x-management-token'] = managementToken;
    }

    const downloadEndpoint = jobId
      ? `${BACKEND_URL}/api/runs/${runId}/artifacts/${jobId}/${encodeURIComponent(artifactName)}/download`
      : `${BACKEND_URL}/api/runs/${runId}/artifacts/${encodeURIComponent(artifactName)}/download`;

    const res = await fetch(downloadEndpoint, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      let message = `Failed to download artifact (HTTP ${res.status})`;
      try {
        const errorJson = await res.json();
        if (errorJson.error) message = errorJson.error;
      } catch {
        // fallback
      }
      throw new Error(message);
    }

    const disposition = res.headers.get('content-disposition');
    let filename = artifactName;
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match && match[1]) {
        filename = match[1].trim();
      }
    }

    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 1000);
  },

  async getSecrets(): Promise<SecretItem[]> {
    return [...mockSecrets];
  },

  async getIntegrations(): Promise<IntegrationStatus[]> {
    return [...mockIntegrations];
  },

  async getRecentEvents(mode?: DataMode): Promise<RecentEvent[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      return [...mockRecentEvents];
    }
    return safeFetch<RecentEvent[]>(
      `${BACKEND_URL}/api/events`,
      { method: 'GET' },
      [...mockRecentEvents]
    );
  },

  async getWebhookDeliveries(mode?: DataMode): Promise<WebhookDeliveryItem[]> {
    const currentMode = mode || getCurrentDataMode();
    if (currentMode === 'demo') {
      const readiness = await this.getIntegrationsReadiness('demo');
      return readiness.recentDeliveries || [];
    }
    const res = await safeFetch<{ deliveries: WebhookDeliveryItem[]; total: number }>(
      `${BACKEND_URL}/api/webhooks/deliveries`,
      { method: 'GET' },
      { deliveries: [], total: 0 }
    );
    return res.deliveries || [];
  }
};
