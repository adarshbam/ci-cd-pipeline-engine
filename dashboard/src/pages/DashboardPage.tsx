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
  Layers,
  Terminal,
  Eye,
  Check
} from 'lucide-react';
import { pipelineApi } from '../api/client';
import { Workflow, PipelineRun, Metrics } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { useDataMode } from '../context/DataModeContext';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { dataMode, isDemoMode } = useDataMode();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [recentRuns, setRecentRuns] = useState<PipelineRun[]>([]);

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
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const hasRuns = recentRuns.length > 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
              CI/CD Pipeline Engine
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono">
              Engine v1.0
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time pipeline monitoring, automated builds, test execution & zero-downtime deployments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
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
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Demo Mode Active:</strong> Showing simulated metrics and mock run history. Toggle to{' '}
              <strong>Real Mode</strong> in the top bar for live engine execution data.
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Runs */}
        <Card variant="surface" className="p-4 border-[#1c2d4a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Pipelines</span>
            <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Activity className={`w-4 h-4 ${metrics.activeRuns > 0 ? 'animate-pulse' : ''}`} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{metrics.activeRuns}</span>
            <span className="text-xs text-sky-400 font-medium">
              {metrics.activeRuns === 1 ? '1 executing' : `${metrics.activeRuns} executing`}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {metrics.activeRuns > 0 ? 'Real-time worker active' : 'No active runs in scheduler'}
          </span>
        </Card>

        {/* Success Rate */}
        <Card variant="surface" className="p-4 border-[#1c2d4a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Success Rate</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {metrics.totalRuns30Days > 0 ? `${metrics.successRate}%` : 'N/A'}
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              {metrics.totalRuns30Days > 0 ? 'Recorded' : 'No runs yet'}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {metrics.totalRuns30Days > 0
              ? `Across ${metrics.totalRuns30Days} completed runs`
              : 'Requires at least 1 completed run'}
          </span>
        </Card>

        {/* Avg Duration */}
        <Card variant="surface" className="p-4 border-[#1c2d4a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Average Duration</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{metrics.avgDuration}</span>
            <span className="text-xs text-indigo-400 font-medium">Engine runtime</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {metrics.avgDuration !== 'N/A'
              ? 'Average completed pipeline time'
              : 'Available once runs complete'}
          </span>
        </Card>

        {/* Loaded Workflows */}
        <Card variant="surface" className="p-4 border-[#1c2d4a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Configured Workflows</span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <GitBranch className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{workflows.length}</span>
            <span className="text-xs text-amber-400 font-medium">Loaded</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            JSON files in `workflows/` directory
          </span>
        </Card>
      </div>

      {/* Main Overview Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Executions List (2 Cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
              Recent Executions ({recentRuns.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/runs')}
              icon={<ArrowUpRight className="w-3.5 h-3.5" />}
            >
              View All Runs
            </Button>
          </div>

          {!hasRuns ? (
            <Card variant="surface" className="p-10 text-center border-dashed border-[#203254]">
              <div className="w-10 h-10 rounded-xl bg-[#12223a] text-sky-400 flex items-center justify-center mx-auto mb-3">
                <PlayCircle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono">No pipeline runs recorded</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                Trigger a manual pipeline using the button above or configure GitHub webhooks to see live runs.
              </p>
              <div className="mt-4">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsTriggerModalOpen(true)}
                  icon={<PlayCircle className="w-3.5 h-3.5" />}
                >
                  Trigger First Run
                </Button>
              </div>
            </Card>
          ) : (
            <Card variant="surface" className="overflow-hidden border-[#1c2d4a] divide-y divide-[#15233c]">
              {recentRuns.slice(0, 6).map((run) => (
                <div
                  key={run.id}
                  className="p-3.5 hover:bg-[#0c1528] transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={run.status} size="xs" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          onClick={() => navigate(`/runs/${run.id}`)}
                          className="font-bold text-white font-mono hover:text-sky-300 transition-colors cursor-pointer"
                        >
                          #{run.runNumber} {run.workflowName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          branch: <strong className="text-slate-300">{run.branch}</strong>
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Started {run.startedAt} • duration: {run.duration}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/runs/${run.id}`)}
                      icon={<Eye className="w-3.5 h-3.5" />}
                    >
                      DAG
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Right: Quick Workflows Selector (1 Col) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
              Configured Pipelines
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/workflows')}
              icon={<ArrowUpRight className="w-3.5 h-3.5" />}
            >
              Explore
            </Button>
          </div>

          <Card variant="surface" className="p-3 border-[#1c2d4a] space-y-2 max-h-[380px] overflow-y-auto">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => navigate(`/workflows/${wf.name}`)}
                className="p-2.5 rounded-xl bg-[#080d19] border border-[#16243d] hover:border-sky-500/40 hover:bg-[#0d1628] transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-bold text-white font-mono hover:text-sky-300 transition-colors">
                    {wf.name}
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {wf.triggers.join(', ')} • {wf.totalRuns || 0} runs
                  </span>
                </div>
                <StatusBadge status={wf.lastRunStatus} size="xs" />
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Trigger Modal */}
      {isTriggerModalOpen && (
        <Modal
          isOpen={isTriggerModalOpen}
          onClose={() => setIsTriggerModalOpen(false)}
          title="Trigger Pipeline Run"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Select Workflow:
              </label>
              <select
                value={selectedWorkflowToRun}
                onChange={(e) => setSelectedWorkflowToRun(e.target.value)}
                className="w-full px-3 py-2 bg-[#090f1e] border border-[#1d2d4c] rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.name} className="bg-[#0b1325]">
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Target Git Branch:
              </label>
              <input
                type="text"
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="w-full px-3 py-2 bg-[#090f1e] border border-[#1d2d4c] rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>

            {triggerNotice && (
              <div
                className={`p-3 rounded-xl text-xs font-mono ${
                  triggerNotice.includes('failed') || triggerNotice.includes('Failed')
                    ? 'bg-red-950/40 text-red-300 border border-red-500/30'
                    : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {triggerNotice}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1a2844]">
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
