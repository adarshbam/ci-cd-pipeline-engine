import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircle,
  Activity,
  CheckCircle2,
  GitBranch,
  Clock,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
  Eye,
  ExternalLink,
  ChevronDown,
  Check,
  MoreHorizontal
} from 'lucide-react';
import { pipelineApi } from '../api/client';
import { Workflow, PipelineRun, Metrics } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { useDataMode } from '../context/DataModeContext';
import { ReactFlowDag } from '../components/pipeline/ReactFlowDag';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { dataMode, isDemoMode } = useDataMode();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [recentRuns, setRecentRuns] = useState<PipelineRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [showRunDropdown, setShowRunDropdown] = useState(false);

  // Trigger modal
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [selectedWorkflowToRun, setSelectedWorkflowToRun] = useState('');
  const [targetBranch, setTargetBranch] = useState('main');
  const [triggering, setTriggering] = useState(false);
  const [triggerNotice, setTriggerNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [m, wf, r] = await Promise.all([
        pipelineApi.getMetrics(dataMode),
        pipelineApi.getWorkflows(dataMode),
        pipelineApi.getRuns('all', 'all', dataMode),
      ]);
      setMetrics(m);
      setWorkflows(wf);
      setRecentRuns(r);
      if (wf.length > 0 && !selectedWorkflowToRun) {
        setSelectedWorkflowToRun(wf[0].name);
      }
      if (r.length > 0 && !selectedRunId) {
        setSelectedRunId(r[0].id);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadData();
      setLoading(false);
    }
    init();
  }, [dataMode]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleTriggerRun = async () => {
    if (!selectedWorkflowToRun) return;
    setTriggering(true);
    setTriggerNotice(null);
    try {
      if (isDemoMode) {
        setTriggerNotice('Demo Mode: Simulated run triggered!');
        setTimeout(() => {
          setIsTriggerModalOpen(false);
          navigate(`/workflows/${selectedWorkflowToRun}`);
        }, 700);
        return;
      }

      const res = await pipelineApi.triggerWorkflow(selectedWorkflowToRun, targetBranch);
      setTriggerNotice(`Run ${res.runId} initiated!`);
      setTimeout(() => {
        setIsTriggerModalOpen(false);
        navigate(`/runs/${res.runId}`);
      }, 700);
    } catch (err: any) {
      setTriggerNotice(`Trigger failed: ${err.message || 'Unknown error'}`);
    } finally {
      setTriggering(false);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const hasRuns = recentRuns.length > 0;
  const activeRun = recentRuns.find((r) => r.id === selectedRunId) || recentRuns[0] || null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5]">
              CI/CD Pipeline Engine
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#18191E] text-[#A1A1AA] border border-[#27272A]">
              Engine v1.0
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
            Real-time pipeline monitoring, automated builds, test execution and zero-downtime deployments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<PlayCircle className="w-3.5 h-3.5" />}
            onClick={() => {
              setIsTriggerModalOpen(true);
              setTriggerNotice(null);
            }}
          >
            Trigger Pipeline
          </Button>
          <Button
            variant="secondary"
            size="sm"
            isLoading={refreshing}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Demo Mode Notice if Active */}
      {isDemoMode && (
        <div className="p-3 bg-[#1A160F] border border-[#3E2B15] rounded-xl flex items-center justify-between text-xs text-[#FDE68A]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>
              <strong>Demo Mode Active:</strong> Showing simulated metrics and mock run history. Toggle to{' '}
              <strong>Real Mode</strong> in the top bar for live engine execution data.
            </span>
          </div>
        </div>
      )}

      {/* Metric Cards Grid - Neutral dark surfaces, clear typography */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Runs */}
        <Card variant="surface" className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#A1A1AA]">Active Pipelines</span>
            <div className="w-7 h-7 rounded-md bg-[#16181D] border border-[#27272A] flex items-center justify-center text-[#A1A1AA]">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#F4F4F5] font-mono">{metrics.activeRuns}</span>
            <span className="text-xs text-[#A1A1AA] font-medium">
              {metrics.activeRuns === 1 ? '1 executing' : `${metrics.activeRuns} executing`}
            </span>
          </div>
          <span className="text-[11px] text-[#71717A] mt-1 block">
            {metrics.activeRuns > 0 ? 'Real-time worker active' : 'No active runs in scheduler'}
          </span>
        </Card>

        {/* Success Rate */}
        <Card variant="surface" className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#A1A1AA]">Success Rate</span>
            <div className="w-7 h-7 rounded-md bg-[#16181D] border border-[#27272A] flex items-center justify-center text-[#A1A1AA]">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#F4F4F5] font-mono">
              {metrics.totalRuns30Days > 0 ? `${metrics.successRate}%` : '0%'}
            </span>
            <span className={`text-xs font-medium ${metrics.totalRuns30Days > 0 ? 'text-[#10B981]' : 'text-[#71717A]'}`}>
              {metrics.totalRuns30Days > 0 ? 'Recorded' : 'No runs yet'}
            </span>
          </div>
          <span className="text-[11px] text-[#71717A] mt-1 block">
            {metrics.totalRuns30Days > 0
              ? `Across ${metrics.totalRuns30Days} completed runs`
              : 'Requires at least 1 completed run'}
          </span>
        </Card>

        {/* Avg Duration */}
        <Card variant="surface" className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#A1A1AA]">Average Duration</span>
            <div className="w-7 h-7 rounded-md bg-[#16181D] border border-[#27272A] flex items-center justify-center text-[#A1A1AA]">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#F4F4F5] font-mono">{metrics.avgDuration}</span>
            <span className="text-xs text-[#A1A1AA] font-medium">Engine runtime</span>
          </div>
          <span className="text-[11px] text-[#71717A] mt-1 block">
            {metrics.avgDuration !== 'N/A'
              ? 'Average completed pipeline time'
              : 'Available once runs complete'}
          </span>
        </Card>

        {/* Configured Workflows */}
        <Card variant="surface" className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#A1A1AA]">Configured Workflows</span>
            <div className="w-7 h-7 rounded-md bg-[#16181D] border border-[#27272A] flex items-center justify-center text-[#A1A1AA]">
              <GitBranch className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#F4F4F5] font-mono">{workflows.length}</span>
            <span className="text-xs text-[#A1A1AA] font-medium">Loaded</span>
          </div>
          <span className="text-[11px] text-[#71717A] mt-1 block">
            JSON files in 'workflows/' directory
          </span>
        </Card>
      </div>

      {/* Main Overview Section: Recent Executions & Configured Pipelines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Executions List (2 Cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
              Recent Executions ({recentRuns.length})
            </h2>
            <button
              onClick={() => navigate('/runs')}
              className="text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1 transition-colors"
            >
              View All Runs <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {!hasRuns ? (
            <Card variant="surface" className="p-8 text-center border-dashed">
              <div className="w-9 h-9 rounded-lg bg-[#18191E] text-[#A1A1AA] flex items-center justify-center mx-auto mb-2.5">
                <PlayCircle className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-semibold text-[#F4F4F5]">No pipeline runs recorded</h3>
              <p className="text-xs text-[#71717A] max-w-sm mx-auto mt-1 leading-relaxed">
                Trigger a manual pipeline using the button above or configure GitHub webhooks to see live runs.
              </p>
              <div className="mt-3">
                <Button
                  variant="primary"
                  size="xs"
                  onClick={() => setIsTriggerModalOpen(true)}
                  icon={<PlayCircle className="w-3 h-3" />}
                >
                  Trigger First Run
                </Button>
              </div>
            </Card>
          ) : (
            <Card variant="surface" noPadding className="divide-y divide-[#1E2026]">
              {recentRuns.slice(0, 5).map((run) => (
                <div
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`p-3.5 hover:bg-[#16181F] transition-colors flex items-center justify-between gap-3 text-xs cursor-pointer ${
                    activeRun?.id === run.id ? 'bg-[#15171D]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={run.status} size="xs" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/runs/${run.id}`);
                          }}
                          className="font-medium text-[#F4F4F5] font-mono hover:text-[#3B82F6] transition-colors cursor-pointer truncate"
                        >
                          #{run.runNumber} {run.workflowName}
                        </span>
                        <span className="text-[10px] text-[#71717A] font-mono shrink-0">
                          <span className="text-[#A1A1AA]">{run.branch}</span>
                        </span>
                      </div>
                      <span className="text-[10px] text-[#71717A] font-mono block mt-0.5">
                        Started {run.startedAt} • duration: {run.duration}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/runs/${run.id}`);
                      }}
                      className="px-2.5 py-1 rounded bg-[#16181D] hover:bg-[#20222A] text-[#D4D4D8] border border-[#27272A] text-[11px] font-mono flex items-center gap-1.5 transition-colors"
                      title="Inspect Run DAG"
                    >
                      <Eye className="w-3 h-3 text-[#A1A1AA]" />
                      <span>DAG</span>
                    </button>
                    <div className="text-right font-mono text-[11px] text-[#71717A] hidden sm:block">
                      {run.duration}
                      <span className="block text-[10px] text-[#52525B]">{run.startedAt}</span>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Right: Configured Pipelines (1 Col) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
              Configured Pipelines
            </h2>
            <button
              onClick={() => navigate('/workflows')}
              className="text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA] flex items-center gap-1 transition-colors"
            >
              Explore <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <Card variant="surface" className="p-2 space-y-1.5 max-h-[360px] overflow-y-auto">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => navigate(`/workflows/${wf.name}`)}
                className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A] hover:border-[#383B46] hover:bg-[#181A22] transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-semibold text-[#F4F4F5] font-mono hover:text-[#3B82F6] transition-colors truncate">
                    {wf.name}
                  </h4>
                  <span className="text-[10px] text-[#71717A] font-mono block mt-0.5">
                    {wf.triggers.join(', ')} • {wf.totalRuns || 0} runs
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={wf.lastRunStatus} size="xs" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/workflows/${wf.name}`);
                    }}
                    className="p-1 rounded text-[#71717A] hover:text-[#F4F4F5]"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Bottom Section: Pipeline Execution Graph matching Reference UI */}
      {activeRun && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[#3B82F6]" />
                <h2 className="text-sm font-semibold text-[#F4F4F5]">
                  Pipeline Execution Graph
                </h2>
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                Visualize the execution flow and status of your CI/CD pipeline in real time.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Run Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowRunDropdown(!showRunDropdown)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] rounded-md text-xs font-medium text-[#D4D4D8] transition-colors"
                >
                  <span className="text-[#71717A] text-[11px]">Run:</span>
                  <span className="font-mono text-xs text-[#F4F4F5] truncate max-w-[200px]">
                    #{activeRun.runNumber} {activeRun.workflowName} ({activeRun.branch})
                  </span>
                  <ChevronDown className="w-3 h-3 text-[#71717A]" />
                </button>

                {showRunDropdown && (
                  <div className="absolute right-0 mt-1 w-72 p-1 bg-[#141519] border border-[#27272A] rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto">
                    <div className="text-[10px] uppercase font-semibold text-[#71717A] px-2 py-1">
                      Recent Runs ({recentRuns.length})
                    </div>
                    {recentRuns.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setSelectedRunId(r.id);
                          setShowRunDropdown(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                          r.id === activeRun.id
                            ? 'bg-[#22242B] text-[#F4F4F5] font-semibold'
                            : 'text-[#A1A1AA] hover:bg-[#1E2026] hover:text-[#F4F4F5]'
                        }`}
                      >
                        <span className="font-mono truncate">
                          #{r.runNumber} {r.workflowName}
                        </span>
                        {r.id === activeRun.id && (
                          <Check className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* View Full DAG Button */}
              <button
                onClick={() => navigate(`/runs/${activeRun.id}`)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] rounded-md text-xs font-medium text-[#D4D4D8] hover:text-[#F4F4F5] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#A1A1AA]" />
                <span>View Full DAG</span>
              </button>
            </div>
          </div>

          {/* DAG Canvas Viewport */}
          <ReactFlowDag
            jobs={activeRun.jobs}
            onSelectJob={(job) => navigate(`/runs/${activeRun.id}?job=${job.id}`)}
            selectedJobId={undefined}
          />
        </div>
      )}

      {/* Trigger Modal */}
      {isTriggerModalOpen && (
        <Modal
          isOpen={isTriggerModalOpen}
          onClose={() => setIsTriggerModalOpen(false)}
          title="Trigger Pipeline Run"
          description="Initiate an automated pipeline run across isolated worker processes."
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Select Workflow:
              </label>
              <select
                value={selectedWorkflowToRun}
                onChange={(e) => setSelectedWorkflowToRun(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#141519] border border-[#27272A] rounded-md text-xs font-mono text-[#F4F4F5] focus:outline-none focus:border-[#3B82F6] cursor-pointer"
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.name} className="bg-[#141519]">
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Target Git Branch:
              </label>
              <input
                type="text"
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#141519] border border-[#27272A] rounded-md text-xs font-mono text-[#F4F4F5] focus:outline-none focus:border-[#3B82F6]"
              />
            </div>

            {triggerNotice && (
              <div
                className={`p-3 rounded-md text-xs font-mono ${
                  triggerNotice.includes('failed') || triggerNotice.includes('Failed')
                    ? 'bg-[#241215] text-[#F87171] border border-[#4C1D24]'
                    : 'bg-[#0D1F17] text-[#34D399] border border-[#164E35]'
                }`}
              >
                {triggerNotice}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#27272A]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTriggerModalOpen(false)}
                disabled={triggering}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={triggering}
                onClick={handleTriggerRun}
                icon={<PlayCircle className="w-3.5 h-3.5" />}
              >
                Start Execution
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
