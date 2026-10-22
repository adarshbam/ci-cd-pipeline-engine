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
  JobStatus
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
  Play,
  RotateCw,
  Ban,
  CheckCircle2
} from 'lucide-react';

export const WorkflowDetailPage: React.FC = () => {
  const { id = 'deploy-main' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { dataMode, isRealMode, isDemoMode } = useDataMode();
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [events, setEvents] = useState<RecentEvent[]>([]);

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
        const [runData, metricsData, envsData, eventsData] = await Promise.all([
          pipelineApi.getRunById(id, dataMode),
          pipelineApi.getMetrics(dataMode),
          pipelineApi.getEnvironments(),
          pipelineApi.getRecentEvents(),
        ]);
        setRun(runData);
        setMetrics(metricsData);
        setEnvironments(envsData);
        setEvents(eventsData);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id, dataMode]);

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

  if (loading || !run || !metrics) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[400px] w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-text">
      {/* 1. Header Area with workflow title, branch, commit SHA, elapsed time, started timestamp, status */}
      <WorkflowHeader
        run={run}
        activeTab={activeTab}
        onTabChange={(tabId: string) => setActiveTab(tabId)}
        onRerun={() => setIsRerunModalOpen(true)}
        onPause={handlePauseAttempt}
        onCancel={() => setIsCancelModalOpen(true)}
        isActionLoading={isActionLoading}
      />

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#111e38] border border-sky-500/40 text-xs text-sky-200 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span>{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. TAB CONTENT */}

      {/* Tab 1: Overview (Hero page matching reference screenshot) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Main Graph Section (React Flow DAG Centerpiece) */}
          {viewMode === 'graph' ? (
            <ReactFlowDag
              jobs={run.jobs}
              onSelectJob={handleSelectJob}
              selectedJobId={selectedJob?.id}
              viewMode={viewMode}
              onToggleViewMode={(mode: 'graph' | 'list') => setViewMode(mode)}
            />
          ) : (
            <div className="p-6 rounded-2xl bg-[#090f1e] border border-[#192742]">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-semibold text-slate-100">Jobs Sequential List</h4>
                <button
                  onClick={() => setViewMode('graph')}
                  className="text-xs text-sky-400 hover:underline"
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
            {/* Left side: Jobs table (columns: #, Job, Status, Duration, Started, Actions) */}
            <div className="lg:col-span-1">
              <JobsTable
                jobs={run.jobs}
                onSelectJob={handleSelectJob}
                selectedJobId={selectedJob?.id}
              />
            </div>

            {/* Right side - Middle: Run Summary cards & Environments */}
            <div className="lg:col-span-1">
              <RunSummaryCard
                metrics={metrics}
                environments={environments}
                onViewAll={() => setActiveTab('environments')}
              />
            </div>

            {/* Right side - Right: Recent Events timeline */}
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
        <Card variant="surface" className="p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1b2b48]">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-sky-400" />
              <h3 className="text-sm font-bold text-slate-100">Consolidated Engine Execution Logs</h3>
            </div>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Connected (Local Engine)
            </span>
          </div>
          <div className="rounded-xl bg-[#050811] border border-[#18263f] p-4 font-mono text-xs text-slate-300 leading-relaxed max-h-[500px] overflow-y-auto space-y-1">
            <div className="text-slate-500">--- Pipeline {run.workflowName} execution log ---</div>
            <div className="text-sky-400">[10:24:01] [SETUP] Worker workspace created in OS temporary directory</div>
            <div className="text-slate-300">[10:24:04] [CHECKOUT] Triggered via push event for branch {run.branch}</div>
            <div className="text-emerald-400">[10:26:14] [BUILD] ✓ Build steps executed with exit code 0</div>
            <div className="text-emerald-400">[10:27:12] [LINT] ✓ Code style verification passed</div>
            <div className="text-emerald-400">[10:30:31] [TEST] ✓ Unit & integration tests settled</div>
            {run.status === 'cancelled' ? (
              <div className="text-amber-400 font-semibold">
                [10:32:00] [CANCEL] Pipeline was cancelled by user. Terminated child process trees.
              </div>
            ) : run.status === 'failed' ? (
              <div className="text-red-400 font-semibold">
                [10:32:45] [ERROR] Job failed with exit code 1
              </div>
            ) : (
              <div className="text-sky-400 font-semibold">
                [10:32:45] [STATUS] Pipeline state: {run.status.toUpperCase()}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 3: Artifacts Tab */}
      {activeTab === 'artifacts' && (
        <Card variant="surface" className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-sky-400" />
              <h3 className="text-sm font-bold text-slate-100">Pipeline Artifacts</h3>
            </div>
            <button
              onClick={() => navigate('/artifacts')}
              className="text-xs text-sky-400 hover:underline"
            >
              Browse all artifacts →
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Artifacts generated by this workflow run. Managed locally in workspace runtime and persisted.
          </p>
          <div className="space-y-3">
            {[
              { name: 'release-bundle.tar.gz', size: '14.2 MB', job: 'build', sha256: '9f83ac24...' },
              { name: 'test-coverage-report.html', size: '2.1 MB', job: 'test', sha256: '88bc310a...' },
              { name: 'dist-manifest.json', size: '4.8 KB', job: 'package', sha256: 'a12ef901...' },
            ].map((art, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-[#0c1426] border border-[#1a2844] flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-500/30 flex items-center justify-center text-sky-400 font-mono text-xs">
                    ZIP
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-slate-200">{art.name}</h5>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {art.size} • Produced by {art.job}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="xs">
                  Download
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 4: Environments */}
      {activeTab === 'environments' && (
        <Card variant="surface" className="p-6">
          <h3 className="text-sm font-bold text-slate-100 mb-4">Target Environments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {environments.map((env) => (
              <div
                key={env.id}
                className="p-4 rounded-xl bg-[#0c1426] border border-[#1a2844] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200">{env.name}</h4>
                  <span className="text-[10px] text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 font-mono">
                    {env.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Branch: <span className="text-slate-200">{env.targetBranch || 'main'}</span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Health Check: <span className="text-emerald-400">{env.healthScore || 100}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 5: Settings */}
      {activeTab === 'settings' && (
        <Card variant="surface" className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-100">Workflow Settings & Webhook Configuration</h3>
          <div className="space-y-3 text-xs text-slate-400">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Webhook Endpoint URL</label>
              <input
                type="text"
                readOnly
                value={`http://localhost:3000/github/ci-cd`}
                className="w-full bg-[#0a1122] border border-[#1b2b48] rounded-lg px-3 py-2 text-slate-200 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Trigger Events</label>
              <div className="flex gap-2">
                <span className="px-2.5 py-1 rounded bg-[#0f1b34] text-sky-400 border border-sky-800/40 font-mono text-[11px]">
                  push
                </span>
                <span className="px-2.5 py-1 rounded bg-[#0f1b34] text-sky-400 border border-sky-800/40 font-mono text-[11px]">
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
        <p className="text-xs text-slate-300 leading-relaxed">
          Are you sure you want to trigger a rerun for workflow{' '}
          <strong className="text-white font-mono">{run.workflowName}</strong> on commit{' '}
          <span className="font-mono text-sky-400">{run.commitSha}</span>?
          All dependency stages will re-execute in clean workspaces.
        </p>
      </Modal>

      {/* Confirmation Modal for Cancel Run (Phase 3 Requirement) */}
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
          <p className="text-xs text-slate-300 leading-relaxed">
            Are you sure you want to cancel pipeline run{' '}
            <strong className="text-white font-mono">{run.id}</strong>?
          </p>
          <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/40 text-xs text-red-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Immediate Backend Actions:
            </div>
            <ul className="list-disc list-inside text-[11px] text-red-300/90 space-y-0.5">
              <li>All active child process trees will be terminated via taskkill/SIGKILL</li>
              <li>Queued jobs will be marked as CANCELLED</li>
              <li>Workspace directories will be released and cleaned up</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Real Job Inspector Drawer (Phase 2 Requirement) */}
      <JobDetailDrawer
        job={selectedJob}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onRerunJob={(jobId) => {
          handleRerun();
        }}
      />
    </div>
  );
};
