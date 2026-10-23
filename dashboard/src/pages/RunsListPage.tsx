import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  GitBranch,
  RefreshCw,
  Ban,
  Terminal,
  Eye,
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
  const [searchParams] = useSearchParams();
  const { dataMode } = useDataMode();

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
        <div className="flex items-center gap-2.5">
          <StatusBadge status={r.status} size="xs" />
          <div className="flex flex-col min-w-0">
            <span
              onClick={() => navigate(`/runs/${r.id}`)}
              className="font-semibold text-[#F4F4F5] font-mono text-xs hover:text-[#3B82F6] transition-colors cursor-pointer truncate"
            >
              #{r.runNumber} {r.workflowName}
            </span>
            <span className="text-[10px] text-[#71717A] font-mono truncate max-w-xs">
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
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <GitBranch className="w-3 h-3 text-[#3B82F6]" />
            <span className="font-semibold text-[#D4D4D8]">{r.branch}</span>
            <span className="text-[#52525B]">@</span>
            <span className="text-[#71717A]">{r.commitSha}</span>
          </div>
          <span className="text-[11px] text-[#71717A] truncate max-w-xs">{r.commitMessage}</span>
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
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-[#D4D4D8]">
                {total > 0 ? `${passedJobs}/${total} jobs` : '0 jobs'}
              </span>
              {failedJobs > 0 && (
                <span className="text-[#F87171] text-[10px] bg-[#241215] px-1.5 py-0.2 rounded border border-[#4C1D24]">
                  {failedJobs} failed
                </span>
              )}
            </div>
            {/* Minimal progress indicators */}
            <div className="flex items-center gap-1">
              {r.jobs.map((j) => (
                <div
                  key={j.id}
                  title={`${j.name}: ${j.status}`}
                  className={`w-1.5 h-1.5 rounded-full ${
                    j.status === 'success'
                      ? 'bg-[#10B981]'
                      : j.status === 'running'
                      ? 'bg-[#3B82F6]'
                      : j.status === 'failed'
                      ? 'bg-[#EF4444]'
                      : j.status === 'cancelled'
                      ? 'bg-[#F59E0B]'
                      : 'bg-[#3F3F46]'
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
        <div className="flex flex-col font-mono text-xs text-[#D4D4D8]">
          <span className="font-medium">{r.duration}</span>
          <span className="text-[10px] text-[#71717A]">{r.elapsedTime}</span>
        </div>
      ),
    },
    {
      header: 'Started',
      cell: (r: PipelineRun) => (
        <span className="text-xs text-[#71717A] font-mono">{r.startedAt}</span>
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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5] font-mono">
              Pipeline Runs
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#18191E] text-[#A1A1AA] border border-[#27272A]">
              {runs.length} runs recorded
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
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
      <div className="p-3 rounded-lg bg-[#111317] border border-[#27272A] flex items-start gap-2.5 text-xs text-[#A1A1AA]">
        <Info className="w-4 h-4 text-[#3B82F6] shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-[#F4F4F5]">Persistent Engine Storage:</strong> Pipeline runs and execution logs are
          safely persisted to local disk storage in <code className="text-[#D4D4D8] font-mono text-[11px] bg-[#141519] px-1.5 py-0.5 rounded border border-[#27272A]">runtime/history/runs</code>.
          Run history and DAG execution state survive server restarts.
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#111317] p-2.5 rounded-xl border border-[#27272A]">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by run ID, workflow, branch, or commit SHA..."
            className="w-full pl-8 pr-4 py-1.5 bg-[#141519] border border-[#27272A] rounded-md text-xs text-[#F4F4F5] placeholder-[#71717A] focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Workflow Filter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#141519] rounded-md border border-[#27272A] text-xs text-[#A1A1AA]">
            <span className="text-[#71717A]">Workflow:</span>
            <select
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
              className="bg-transparent text-[#D4D4D8] focus:outline-none cursor-pointer font-mono"
            >
              <option value="all" className="bg-[#141519]">All Workflows</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.name} className="bg-[#141519]">
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#141519] rounded-md border border-[#27272A] text-xs text-[#A1A1AA]">
            <span className="text-[#71717A]">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent text-[#D4D4D8] focus:outline-none cursor-pointer uppercase text-[11px]"
            >
              <option value="all" className="bg-[#141519]">All Statuses</option>
              <option value="running" className="bg-[#141519]">Running</option>
              <option value="success" className="bg-[#141519]">Success</option>
              <option value="failed" className="bg-[#141519]">Failed</option>
              <option value="cancelled" className="bg-[#141519]">Cancelled</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#141519] rounded-md border border-[#27272A] text-xs text-[#A1A1AA]">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="bg-transparent text-[#D4D4D8] focus:outline-none cursor-pointer"
            >
              <option value="newest" className="bg-[#141519]">Newest First</option>
              <option value="oldest" className="bg-[#141519]">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Runs Table Card */}
      <Card variant="surface" noPadding className="border border-[#27272A]">
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
            <p className="text-xs text-[#D4D4D8] leading-relaxed">
              Are you sure you want to cancel pipeline run{' '}
              <strong className="text-white font-mono">{runToCancel.id}</strong> (
              <code className="text-[#3B82F6]">{runToCancel.workflowName}</code>)?
            </p>
            <p className="text-xs text-[#71717A]">
              This will trigger process tree termination for all active child processes and transition running jobs to CANCELLED.
            </p>

            {cancelNotice && (
              <div
                className={`p-3 rounded-md text-xs font-mono ${
                  cancelNotice.includes('failed')
                    ? 'bg-[#241215] text-[#F87171] border border-[#4C1D24]'
                    : 'bg-[#0D1F17] text-[#34D399] border border-[#164E35]'
                }`}
              >
                {cancelNotice}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#27272A]">
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
