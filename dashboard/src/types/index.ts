export type JobStatus =
  | 'success'
  | 'running'
  | 'queued'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'idle';

export type JobIconType =
  | 'webhook'
  | 'build'
  | 'test'
  | 'lint'
  | 'package'
  | 'deploy'
  | 'health-check'
  | 'rollback'
  | 'custom';

export interface JobLogEntry {
  id: string;
  jobId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  message: string;
}

export interface StepDetail {
  name: string;
  status: JobStatus;
  duration?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
}

export interface Job {
  id: string;
  runId: string;
  name: string;
  stage?: string;
  status: JobStatus;
  duration: string;
  startedAt?: string;
  completedAt?: string;
  iconType: JobIconType;
  dependsOn?: string[];
  progress?: number; // e.g. 60%
  description?: string;
  stepCount?: number;
  completedSteps?: number;
  exitCode?: number | null;
  failureReason?: string;
  steps?: StepDetail[];
  logs?: JobLogEntry[];
}

export interface AuthorInfo {
  name: string;
  username: string;
  avatar?: string;
}

export interface PipelineRun {
  id: string;
  workflowId: string;
  workflowName: string;
  runNumber: number;
  status: JobStatus;
  branch: string;
  commitSha: string;
  commitMessage: string;
  author: AuthorInfo;
  trigger: string; // e.g. "Triggered by push", "webhook"
  totalJobs: number;
  duration: string;
  startedAt: string;
  elapsedTime: string;
  environment?: string;
  jobs: Job[];
  isIdlePreview?: boolean;
  repository?: string;
  deliveryId?: string;
  commitStatus?: {
    state: 'pending' | 'success' | 'failure' | 'unavailable';
    context: string;
    description: string;
    url?: string;
    commitUrl?: string;
    targetUrl?: string;
    updatedAt?: string;
  };
}

export interface Workflow {
  id: string;
  name: string;
  slug: string;
  description: string;
  repository: string;
  defaultBranch: string;
  lastRunStatus: JobStatus;
  lastRunTime: string;
  triggers: ('push' | 'pull_request' | 'manual' | 'schedule' | 'webhook')[];
  activeRunsCount: number;
  successRate: number;
  avgDuration: string;
  totalRuns: number;
  yamlConfig?: string;
}

export interface Environment {
  id: string;
  name: 'Production' | 'Staging' | 'Preview' | string;
  status: 'deploying' | 'idle' | 'healthy' | 'error';
  url?: string;
  currentRunId?: string;
  lastDeployedAt?: string;
  activeVersion?: string;
  healthScore?: number;
  targetBranch?: string;
}

export interface Artifact {
  id: string;
  runId?: string;
  name: string;
  size: string;
  sizeBytes?: number;
  type: 'tar' | 'zip' | 'docker' | 'report' | 'binary' | 'directory';
  jobName: string;
  jobId?: string;
  createdAt: string;
  downloadUrl?: string;
  sha256: string;
  expiresIn?: string;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  provider:
    | 'github'
    | 'slack'
    | 'docker'
    | 'aws'
    | 'backblaze'
    | 'datadog'
    | 'sentry';
  status: 'connected' | 'disconnected' | 'warning' | 'syncing';
  webhookUrl?: string;
  lastSync?: string;
  eventsHandledCount?: number;
  description?: string;
  secretKeyPrefix?: string;
}

export interface SecretItem {
  id: string;
  name: string;
  environment: string;
  lastUpdated: string;
  updatedBy: string;
  preview: string;
}

export interface Metrics {
  activeRuns: number;
  successRate: number;
  avgDuration: string;
  durationChangePercentage: number;
  totalRuns30Days: number;
  failureCount: number;
  queuedRuns: number;
}

export interface RecentEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  type:
    | 'webhook'
    | 'build'
    | 'test'
    | 'lint'
    | 'package'
    | 'deploy'
    | 'system';
  status: JobStatus | 'info';
  metadata?: string;
}

export interface EngineStatus {
  status: 'online' | 'offline';
  activeRuns: number;
  totalWorkflows: number;
  version: string;
  timestamp: string;
  port?: string;
}

export type DataMode = 'real' | 'demo';

export interface BackendWorkflow {
  name: string;
  webhook: {
    url: string;
    methods?: ('GET' | 'POST')[];
  };
  trigger: {
    events: string[];
    branches?: Record<string, string>;
    allowedBranches?: string[];
    allowedRepositories?: string[];
  };
  environments?: string[];
  jobCount: number;
  jobs: Record<string, any>;
  isValid: boolean;
  validationErrors: string[];
  runsCount: number;
  lastRun?: {
    id: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    branch?: string;
    durationMs?: number;
  };
}

export interface BackendWorkflowDetail {
  workflow: {
    name: string;
    webhook: {
      url: string;
      methods?: string[];
    };
    trigger: {
      events: string[];
      allowedBranches?: string[];
      allowedRepositories?: string[];
    };
    environments?: Record<string, { healthUrl?: string; envConfigured?: boolean }>;
    jobs: Record<string, any>;
  };
  isValid: boolean;
  validationErrors: string[];
  jobCount: number;
  runsCount: number;
  lastRun?: {
    id: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    branch?: string;
    environment?: string;
    durationMs?: number;
  };
  metrics?: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    avgDurationMs: number;
  };
}

export interface WebhookDeliveryItem {
  id: string;
  workflowName: string;
  event: string;
  repository: string;
  branch: string;
  commitSha: string;
  timestamp: string;
  status: 'accepted' | 'rejected' | 'skipped';
  validationOutcome?: string;
  outcomeReason?: string;
  runId?: string;
  commitStatus?: {
    state: 'pending' | 'success' | 'failure' | 'unavailable';
    context: string;
    description: string;
    url?: string;
    commitUrl?: string;
    targetUrl?: string;
    updatedAt?: string;
  };
}

export interface IntegrationsReadiness {
  backendOnline: boolean;
  port: string;
  loadedWorkflowsCount: number;
  activeRunsCount: number;
  totalRunsRecorded: number;
  githubTokenConfigured: boolean;
  githubWebhookSecretConfigured: boolean;
  publicWebhookBaseUrl: string | null;
  managementSecretConfigured: boolean;
  recentDeliveries: WebhookDeliveryItem[];
  memoryPersistenceNotice: string;
}

export interface AggregateMetrics {
  totalRuns: number;
  activeRuns: number;
  successfulRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  successRate: number | null;
  avgDurationMs: number | null;
  totalWorkflows: number;
  timestamp: string;
}

export function mapBackendStatus(status?: string): JobStatus {
  switch (status?.toUpperCase()) {
    case 'SUCCESS':
      return 'success';
    case 'RUNNING':
      return 'running';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'SKIPPED':
      return 'skipped';
    case 'IDLE':
      return 'idle';
    case 'QUEUED':
    default:
      return 'queued';
  }
}
