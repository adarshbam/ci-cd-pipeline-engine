import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  GitBranch,
  ArrowRight,
  RefreshCw,
  Ban,
  Terminal,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  Filter,
  Layers,
  Info
} from 'lucide-react';
import { pipelineApi } from '../api/client';
import { PipelineRun, Workflow } from '../types';
import { Card } from '../components/ui/Card';
import { Table, Column } from '../components/ui/Table';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { useDataMode } from '../context/DataModeContext';

export const RunsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataMode, isDemoMode } = useDataMode();

  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const initialWorkflow = searchParams.get('workflow') || 'all';
  const initialStatus = searchParams.get('status') || 'all';
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>(initialWorkflow);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Cancel Modal
  const [runToCancel, setRunToCancel] = useState<PipelineRun | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);

  const fetchRunsData = async () => {
    try {
      const [runsData, workflowsData] = await Promise.all([
        pipelineApi.getRuns(selectedWorkflow, selectedStatus, dataMode),
        pipelineApi.getWorkflows(dataMode)
      ]);
      setRuns(runsData);
      setWorkflows(workflowsData);
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchRunsData();
      setLoading(false);
    }
    init();
  }, [selectedWorkflow, selectedStatus, dataMode]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchRunsData();
    setRefreshing(false);
  };

  const handleCancelRun = async () => {
    if (!runToCancel) return;
    setCancelling(true);
    setCancelNotice(null);
    try {
      const res = await pipelineApi.cancelRun(runToCancel.id);
      if (res.success) {
        setCancelNotice(res.message);
        await fetchRunsData();
        setTimeout(() => setRunToCancel(null), 1000);
      } else {
        setCancelNotice(`Cancellation failed: ${res.message}`);
      }
    } catch (err: any) {
      setCancelNotice(`Cancellation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setCancelling(false);
    }
  };

  const filteredRuns = runs
    .filter((r) => {
      const matchesSearch =
        r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.workflowName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.branch.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.commitSha.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => {
      if (sortOrder === 'oldest') {
        return a.runNumber - b.runNumber;
      }
      return b.runNumber - a.runNumber;
    });

  const columns: Column<PipelineRun>[] = [
    {
      header: 'Run Execution',
      cell: (r: PipelineRun) => (
        <div className="flex items-center gap-3">
          <StatusBadge status={r.status} size="xs" />
          <div className="flex flex-col">
            <span
              onClick={() => navigate(`/runs/${r.id}`)}
              className="font-bold text-slate-100 font-mono text-xs hover:text-sky-300 transition-colors cursor-pointer"
            >
              #{r.runNumber} {r.workflowName}
            </span>
            <span className="text-[10px] text-slate-500 font-mono truncate max-w-xs">
              ID: {r.id} • {r.trigger}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Git Context',
      cell: (r: PipelineRun) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-slate-300 font-mono text-xs">
            <GitBranch className="w-3 h-3 text-sky-400" />
            <span className="font-semibold text-slate-200">{r.branch}</span>
            <span className="text-slate-600">@</span>
            <span className="text-slate-400 font-mono">{r.commitSha}</span>
          </div>
          <span className="text-[11px] text-slate-400 truncate max-w-xs">{r.commitMessage}</span>
        </div>
      ),
    },
    {
      header: 'Progress / Jobs',
      cell: (r: PipelineRun) => {
        const passedJobs = r.jobs.filter((j) => j.status === 'success').length;
        const failedJobs = r.jobs.filter((j) => j.status === 'failed').length;
        const total = r.jobs.length;

        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-300 font-medium">
                {total > 0 ? `${passedJobs}/${total} jobs` : '0 jobs'}
              </span>
              {failedJobs > 0 && (
                <span className="text-red-400 text-[10px] bg-red-950/50 px-1.5 py-0.2 rounded border border-red-500/30">
                  {failedJobs} failed
                </span>
              )}
            </div>
            {/* Tiny progress dots */}
            <div className="flex items-center gap-1">
              {r.jobs.map((j) => (
                <div
                  key={j.id}
                  title={`${j.name}: ${j.status}`}
                  className={`w-2 h-2 rounded-full ${
                    j.status === 'success'
                      ? 'bg-emerald-400'
                      : j.status === 'running'
                      ? 'bg-sky-400 animate-pulse'
                      : j.status === 'failed'
                      ? 'bg-red-400'
                      : j.status === 'cancelled'
                      ? 'bg-slate-500'
                      : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Duration',
      cell: (r: PipelineRun) => (
        <div className="flex flex-col font-mono text-xs text-slate-300">
          <span className="font-semibold">{r.duration}</span>
          <span className="text-[10px] text-slate-500">{r.elapsedTime}</span>
        </div>
      ),
    },
    {
      header: 'Started',
      cell: (r: PipelineRun) => (
        <span className="text-xs text-slate-400 font-mono">{r.startedAt}</span>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (r: PipelineRun) => {
        const firstFailed = r.jobs.find((j) => j.status === 'failed');

        return (
          <div className="flex items-center justify-end gap-1.5">
            {/* View DAG Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/runs/${r.id}`)}
              icon={<Eye className="w-3.5 h-3.5" />}
              title="View Run DAG"
            >
              DAG
            </Button>

            {/* Quick Logs deep-link if job failed */}
            {firstFailed && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => navigate(`/runs/${r.id}?job=${firstFailed.id}`)}
                icon={<Terminal className="w-3.5 h-3.5" />}
                title="View failure logs"
              >
                Logs
              </Button>
            )}

            {/* Cancel Button if running */}
            {r.status === 'running' && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setRunToCancel(r);
                  setCancelNotice(null);
                }}
                icon={<Ban className="w-3.5 h-3.5" />}
              >
                Cancel
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
              Pipeline Runs
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {runs.length} runs recorded
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time execution log and historical lifecycle events across all engine workflows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            isLoading={refreshing}
            onClick={handleManualRefresh}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Persistent Storage Notice */}
      <div className="p-3.5 rounded-xl bg-[#0b1426] border border-[#1d2f50] flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-100">Persistent Engine Storage:</strong> Pipeline runs and execution logs are
          safely persisted to local disk storage in <code className="text-sky-300 font-mono text-[11px] bg-[#070d18] px-1.5 py-0.5 rounded border border-[#162744]">runtime/history/runs</code>.
          Run history and DAG execution state survive server restarts, and interrupted runs are honestly marked failed upon recovery.
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0a101f] p-3 rounded-2xl border border-[#1b2b48]">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by run ID, workflow, branch, or commit SHA..."
            className="w-full pl-9 pr-4 py-2 bg-[#060a14] border border-[#17243c] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Workflow Filter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#060a14] rounded-xl border border-[#17243c] text-xs text-slate-300">
            <span className="text-slate-500">Workflow:</span>
            <select
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-mono"
            >
              <option value="all" className="bg-[#0b1325]">All Workflows</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.name} className="bg-[#0b1325]">
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#060a14] rounded-xl border border-[#17243c] text-xs text-slate-300">
            <span className="text-slate-500">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer uppercase"
            >
              <option value="all" className="bg-[#0b1325]">All Statuses</option>
              <option value="running" className="bg-[#0b1325]">Running</option>
              <option value="success" className="bg-[#0b1325]">Success</option>
              <option value="failed" className="bg-[#0b1325]">Failed</option>
              <option value="cancelled" className="bg-[#0b1325]">Cancelled</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#060a14] rounded-xl border border-[#17243c] text-xs text-slate-300">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="newest" className="bg-[#0b1325]">Newest First</option>
              <option value="oldest" className="bg-[#0b1325]">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Runs Table Card */}
      <Card variant="surface" className="overflow-hidden border-[#1b2a47]">
        <Table<PipelineRun>
          columns={columns}
          data={filteredRuns}
          keyExtractor={(r) => r.id}
          emptyMessage="No pipeline runs match your current filters. Trigger a workflow from the Workflows page or push code to GitHub to execute a run."
        />
      </Card>

      {/* Cancellation Confirmation Modal */}
      {runToCancel && (
        <Modal
          isOpen={Boolean(runToCancel)}
          onClose={() => setRunToCancel(null)}
          title={`Cancel Run: ${runToCancel.id}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to cancel pipeline run{' '}
              <strong className="text-white font-mono">{runToCancel.id}</strong> (
              <code className="text-sky-300">{runToCancel.workflowName}</code>)?
            </p>
            <p className="text-xs text-slate-400">
              This will trigger process tree termination (`taskkill` on Windows) for all active child processes and transition running jobs to <code className="text-red-300">CANCELLED</code>.
            </p>

            {cancelNotice && (
              <div
                className={`p-3 rounded-xl text-xs font-mono ${
                  cancelNotice.includes('failed')
                    ? 'bg-red-950/40 text-red-300 border border-red-500/30'
                    : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {cancelNotice}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1a2844]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRunToCancel(null)}
                disabled={cancelling}
              >
                Close
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={cancelling}
                onClick={handleCancelRun}
                icon={<Ban className="w-3.5 h-3.5" />}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
