import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { pipelineApi } from '../api/client';
import { useDataMode } from '../context/DataModeContext';
import {
  PipelineRun,
  Job,
  Metrics,
  Environment,
  RecentEvent,
  Artifact
} from '../types';
import { WorkflowHeader } from '../components/pipeline/WorkflowHeader';
import { ReactFlowDag } from '../components/pipeline/ReactFlowDag';
import { JobsTable } from '../components/pipeline/JobsTable';
import { RunSummaryCard } from '../components/pipeline/RunSummaryCard';
import { RecentEventsCard } from '../components/pipeline/RecentEventsCard';
import { JobDetailDrawer } from '../components/pipeline/JobDetailDrawer';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  Terminal,
  Package,
  Layers,
  AlertTriangle,
  RotateCw
} from 'lucide-react';

export const WorkflowDetailPage: React.FC = () => {
  const { id = 'deploy-main' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { dataMode, isDemoMode } = useDataMode();
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [downloadingArtifactId, setDownloadingArtifactId] = useState<string | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Deep-link to job inspector if query param is set
  useEffect(() => {
    const jobParam = searchParams.get('job');
    if (jobParam && run) {
      const match = run.jobs.find(
        (j) => j.id.toLowerCase() === jobParam.toLowerCase() || j.name.toLowerCase() === jobParam.toLowerCase()
      );
      if (match) {
        setSelectedJob(match);
        setIsDrawerOpen(true);
      }
    }
  }, [searchParams, run]);

  // Cancellation and Actions
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isRerunModalOpen, setIsRerunModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const isPreview = searchParams.get('preview') === 'true';
        const [runData, metricsData, envsData, eventsData] = await Promise.all([
          pipelineApi.getRunById(id, dataMode, isPreview),
          pipelineApi.getMetrics(dataMode),
          pipelineApi.getEnvironments(dataMode),
          pipelineApi.getRecentEvents(dataMode),
        ]);
        setRun(runData);
        setMetrics(metricsData);
        setEnvironments(envsData);
        setEvents(eventsData);

        if (runData && runData.id) {
          try {
            const artData = await pipelineApi.getRunArtifacts(runData.id, dataMode);
            setArtifacts(artData);
          } catch {
            // fallback
          }
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, dataMode, searchParams]);

  // Polling for active running state
  useEffect(() => {
    if (!run || run.status !== 'running') return;

    const interval = setInterval(async () => {
      try {
        const updated = await pipelineApi.getRunById(run.id);
        if (updated) {
          setRun(updated);
        }
      } catch {
        // Keep existing state
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [run?.id, run?.status]);

  const handleSelectJob = (job: Job) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  const handlePauseAttempt = () => {
    setActionNotice(
      'Notice: Process pausing is not supported by the underlying process scheduler. Use Cancel Run to abort active processes.'
    );
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleRerun = async () => {
    if (!run) return;
    setIsActionLoading(true);
    try {
      if (isDemoMode) {
        const res = await pipelineApi.rerunRun(run.id || 'run-1');
        setRun({ ...run, status: 'running' });
        setActionNotice(res.message);
      } else {
        const res = await pipelineApi.triggerWorkflow(run.workflowName || run.workflowId, run.branch);
        setActionNotice(`Pipeline triggered: Run #${res.runId} initiated!`);
        setTimeout(() => {
          navigate(`/runs/${res.runId}`);
        }, 1000);
      }
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setActionNotice(`Trigger failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsActionLoading(false);
      setIsRerunModalOpen(false);
    }
  };

  const handleCancelRun = async () => {
    if (!run) return;
    setIsActionLoading(true);
    try {
      const res = await pipelineApi.cancelRun(run.id);
      setRun({
        ...run,
        status: 'cancelled',
        jobs: run.jobs.map((j) =>
          j.status === 'running' || j.status === 'queued'
            ? { ...j, status: 'cancelled', failureReason: 'Cancelled by user' }
            : j
        ),
      });
      setActionNotice(res.message);
      setTimeout(() => setActionNotice(null), 4000);
    } finally {
      setIsActionLoading(false);
      setIsCancelModalOpen(false);
    }
  };

  const handleDownloadArtifact = async (art: Artifact) => {
    if (!run) return;
    setDownloadingArtifactId(art.id);
    setArtifactError(null);
    try {
      await pipelineApi.downloadArtifact(
        art.runId || run.id,
        art.jobId || art.jobName,
        art.name
      );
    } catch (err: any) {
      console.error('Download error:', err);
      setArtifactError(err?.message || 'Failed to download artifact file');
    } finally {
      setDownloadingArtifactId(null);
    }
  };

  if (loading || !run || !metrics) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-[380px] w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-text">
      {/* 1. Header Area */}
      <WorkflowHeader
        run={run}
        activeTab={activeTab}
        onTabChange={(tabId: string) => setActiveTab(tabId)}
        onRerun={() => setIsRerunModalOpen(true)}
        onPause={handlePauseAttempt}
        onCancel={() => setIsCancelModalOpen(true)}
        isActionLoading={isActionLoading}
        artifactCount={artifacts.length}
      />

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-[#141519] border border-[#27272A] text-xs text-[#D4D4D8]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
            <span>{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-[#71717A] hover:text-[#F4F4F5]"
          >
            ✕
          </button>
        </div>
      )}

      {/* Workflow Topology Preview vs Run Execution Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2 rounded-lg bg-[#141519] border border-[#27272A] text-xs">
        <div className="flex items-center gap-2">
          {run.isIdlePreview ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
              <span className="text-[#A1A1AA]">
                Workflow Definition Preview (All jobs idle) — Inspect declared DAG topology & dependencies
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              <span className="text-[#A1A1AA]">
                Pipeline Run Execution: <code className="text-[#F4F4F5] font-bold">{run.id}</code> ({run.status.toUpperCase()})
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {run.isIdlePreview ? (
            <button
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('preview');
                navigate(`?${next.toString()}`);
              }}
              className="px-2.5 py-1 rounded bg-[#18191E] hover:bg-[#20222A] text-[#3B82F6] border border-[#27272A] font-medium transition-colors flex items-center gap-1.5 text-xs"
            >
              <RotateCw className="w-3 h-3" />
              <span>View Latest Run</span>
            </button>
          ) : (
            <button
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set('preview', 'true');
                navigate(`?${next.toString()}`);
              }}
              className="px-2.5 py-1 rounded bg-[#18191E] hover:bg-[#20222A] text-[#D4D4D8] border border-[#27272A] font-medium transition-colors flex items-center gap-1.5 text-xs"
            >
              <Layers className="w-3 h-3 text-[#A1A1AA]" />
              <span>Preview Definition DAG</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. TAB CONTENT */}

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Main Graph Section (React Flow DAG Centerpiece — PROTECTED) */}
          {viewMode === 'graph' ? (
            <ReactFlowDag
              jobs={run.jobs}
              onSelectJob={handleSelectJob}
              selectedJobId={selectedJob?.id}
              viewMode={viewMode}
              onToggleViewMode={(mode: 'graph' | 'list') => setViewMode(mode)}
            />
          ) : (
            <div className="p-5 rounded-xl bg-[#111317] border border-[#27272A]">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  Jobs Sequential List
                </h4>
                <button
                  onClick={() => setViewMode('graph')}
                  className="text-xs text-[#3B82F6] hover:underline"
                >
                  Switch back to Graph view
                </button>
              </div>
              <JobsTable
                jobs={run.jobs}
                onSelectJob={handleSelectJob}
                selectedJobId={selectedJob?.id}
              />
            </div>
          )}

          {/* 3. Below Graph 3-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: Jobs table */}
            <div className="lg:col-span-1">
              <JobsTable
                jobs={run.jobs}
                onSelectJob={handleSelectJob}
                selectedJobId={selectedJob?.id}
              />
            </div>

            {/* Middle: Run Summary */}
            <div className="lg:col-span-1">
              <RunSummaryCard
                metrics={metrics}
                environments={environments}
                onViewAll={() => setActiveTab('environments')}
              />
            </div>

            {/* Right: Recent Events timeline */}
            <div className="lg:col-span-1">
              <RecentEventsCard
                events={events}
                onViewAll={() => navigate('/runs')}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Logs Tab */}
      {activeTab === 'logs' && (
        <Card variant="surface" className="p-5">
          <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-[#27272A]">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#3B82F6]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                Consolidated Engine Execution Logs
              </h3>
            </div>
            <span className="text-xs font-mono text-[#34D399] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Connected (Local Engine)
            </span>
          </div>
          <div className="rounded-lg bg-[#0B0C0E] border border-[#27272A] p-3.5 font-mono text-xs text-[#D4D4D8] leading-relaxed max-h-[500px] overflow-y-auto space-y-1">
            <div className="text-[#71717A]">--- Pipeline {run.workflowName} execution log ---</div>
            <div className="text-[#60A5FA]">[10:24:01] [SETUP] Worker workspace created in OS temporary directory</div>
            <div className="text-[#A1A1AA]">[10:24:04] [CHECKOUT] Triggered via push event for branch {run.branch}</div>
            <div className="text-[#34D399]">[10:26:14] [BUILD] ✓ Build steps executed with exit code 0</div>
            <div className="text-[#34D399]">[10:27:12] [LINT] ✓ Code style verification passed</div>
            <div className="text-[#34D399]">[10:30:31] [TEST] ✓ Unit & integration tests settled</div>
            {run.status === 'cancelled' ? (
              <div className="text-[#FBBF24] font-medium">
                [10:32:00] [CANCEL] Pipeline was cancelled by user. Terminated child process trees.
              </div>
            ) : run.status === 'failed' ? (
              <div className="text-[#F87171] font-medium">
                [10:32:45] [ERROR] Job failed with exit code 1
              </div>
            ) : (
              <div className="text-[#60A5FA] font-medium">
                [10:32:45] [STATUS] Pipeline state: {run.status.toUpperCase()}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 3: Artifacts Tab */}
      {activeTab === 'artifacts' && (
        <Card variant="surface" className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#3B82F6]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                Pipeline Artifacts ({artifacts.length})
              </h3>
            </div>
            <button
              onClick={() => navigate('/artifacts')}
              className="text-xs text-[#3B82F6] hover:underline"
            >
              Browse all artifacts →
            </button>
          </div>
          <p className="text-xs text-[#71717A] mb-3.5">
            Artifacts generated by this workflow run. Managed locally in workspace runtime and persisted.
          </p>

          {artifactError && (
            <div className="mb-3.5 p-3 rounded-lg bg-[#241215] border border-[#4C1D24] text-xs text-[#F87171] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{artifactError}</span>
              </div>
              <button
                onClick={() => setArtifactError(null)}
                className="text-[#71717A] hover:text-[#F4F4F5] font-bold px-1"
              >
                ✕
              </button>
            </div>
          )}

          {artifacts.length === 0 ? (
            <div className="p-8 rounded-lg bg-[#141519] border border-[#22242A] text-center space-y-2">
              <Package className="w-8 h-8 text-[#52525B] mx-auto opacity-60" />
              <h4 className="text-xs font-semibold text-[#F4F4F5] font-mono">
                No artifacts produced by this run
              </h4>
              <p className="text-[11px] text-[#71717A] max-w-md mx-auto leading-relaxed">
                This workflow run did not upload any persistent output files. To produce downloadable artifacts, declare an <code className="text-[#3B82F6] font-mono">artifacts.upload</code> block in your workflow definition.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {artifacts.map((art) => {
                const isDownloading = downloadingArtifactId === art.id;
                const fileTypeBadge =
                  art.type === 'tar'
                    ? 'TAR'
                    : art.type === 'zip'
                    ? 'ZIP'
                    : art.type === 'report'
                    ? 'DOC'
                    : art.type === 'directory'
                    ? 'DIR'
                    : 'BIN';

                return (
                  <div
                    key={art.id}
                    className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-[#18191E] border border-[#27272A] flex items-center justify-center text-[#3B82F6] font-mono text-[10px] font-bold shrink-0">
                        {fileTypeBadge}
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-medium text-[#F4F4F5] font-mono truncate">
                          {art.name}
                        </h5>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-[#71717A] font-mono">
                          <span>{art.size}</span>
                          <span>•</span>
                          <span>Produced by {art.jobName || art.jobId}</span>
                          {art.sha256 && (
                            <>
                              <span>•</span>
                              <span className="text-[#52525B]" title={`SHA256: ${art.sha256}`}>
                                SHA: {art.sha256.slice(0, 10)}...
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="xs"
                      isLoading={isDownloading}
                      onClick={() => handleDownloadArtifact(art)}
                      className="shrink-0 self-end sm:self-auto"
                    >
                      Download
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: Environments */}
      {activeTab === 'environments' && (
        <Card variant="surface" className="p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-3">
            Target Environments
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {environments.map((env) => (
              <div
                key={env.id}
                className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#F4F4F5]">{env.name}</h4>
                  <span className="text-[10px] text-[#34D399] px-1.5 py-0.5 rounded bg-[#0D1F17] border border-[#164E35] font-mono">
                    {env.status}
                  </span>
                </div>
                <div className="text-xs text-[#71717A] font-mono">
                  Branch: <span className="text-[#D4D4D8]">{env.targetBranch || 'main'}</span>
                </div>
                <div className="text-xs text-[#71717A] font-mono">
                  Health Check: <span className="text-[#10B981]">{env.healthScore || 100}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 5: Settings */}
      {activeTab === 'settings' && (
        <Card variant="surface" className="p-5 space-y-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
            Workflow Settings &amp; Webhook Configuration
          </h3>
          <div className="space-y-3 text-xs text-[#A1A1AA]">
            <div>
              <label className="block text-[#D4D4D8] font-medium mb-1">Webhook Endpoint URL</label>
              <input
                type="text"
                readOnly
                value={`http://localhost:3000/github/ci-cd`}
                className="w-full bg-[#0B0C0E] border border-[#27272A] rounded-md px-3 py-1.5 text-[#F4F4F5] font-mono text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[#D4D4D8] font-medium mb-1">Trigger Events</label>
              <div className="flex gap-2">
                <span className="px-2 py-0.5 rounded bg-[#16181D] text-[#3B82F6] border border-[#27272A] font-mono text-[11px]">
                  push
                </span>
                <span className="px-2 py-0.5 rounded bg-[#16181D] text-[#3B82F6] border border-[#27272A] font-mono text-[11px]">
                  pull_request
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Confirmation Modal for Rerun */}
      <Modal
        isOpen={isRerunModalOpen}
        onClose={() => setIsRerunModalOpen(false)}
        title="Trigger Pipeline Rerun"
        confirmLabel="Confirm Rerun"
        cancelLabel="Cancel"
        onConfirm={handleRerun}
        isConfirmLoading={isActionLoading}
      >
        <p className="text-xs text-[#D4D4D8] leading-relaxed">
          Are you sure you want to trigger a rerun for workflow{' '}
          <strong className="text-white font-mono">{run.workflowName}</strong> on commit{' '}
          <span className="font-mono text-[#3B82F6]">{run.commitSha}</span>?
          All dependency stages will re-execute in clean workspaces.
        </p>
      </Modal>

      {/* Confirmation Modal for Cancel Run */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Active Pipeline Run"
        type="danger"
        confirmLabel="Confirm Cancel"
        cancelLabel="Keep Running"
        onConfirm={handleCancelRun}
        isConfirmLoading={isActionLoading}
      >
        <div className="space-y-3">
          <p className="text-xs text-[#D4D4D8] leading-relaxed">
            Are you sure you want to cancel pipeline run{' '}
            <strong className="text-white font-mono">{run.id}</strong>?
          </p>
          <div className="p-3 rounded-lg bg-[#241215] border border-[#4C1D24] text-xs text-[#F87171] space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444]" /> Immediate Backend Actions:
            </div>
            <ul className="list-disc list-inside text-[11px] text-[#F87171]/90 space-y-0.5">
              <li>All active child process trees will be terminated</li>
              <li>Queued jobs will be marked as CANCELLED</li>
              <li>Workspace directories will be released</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Job Inspector Drawer */}
      <JobDetailDrawer
        job={selectedJob}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onRerunJob={() => {
          handleRerun();
        }}
      />
    </div>
  );
};
