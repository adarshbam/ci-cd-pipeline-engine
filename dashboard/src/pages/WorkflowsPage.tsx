import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Search,
  Copy,
  Check,
  Play,
  Eye,
  History,
  AlertCircle,
  CheckCircle2,
  ArrowUpDown,
  Code2
} from 'lucide-react';
import { pipelineApi } from '../api/client';
import { BackendWorkflow, BackendWorkflowDetail } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { useDataMode } from '../context/DataModeContext';

export const WorkflowsPage: React.FC = () => {
  const navigate = useNavigate();
  const { dataMode, isDemoMode } = useDataMode();
  const [workflows, setWorkflows] = useState<BackendWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [validityFilter, setValidityFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'activity' | 'jobs'>('name');

  // Trigger Modal
  const [triggerModalWf, setTriggerModalWf] = useState<BackendWorkflow | null>(null);
  const [targetBranch, setTargetBranch] = useState('main');
  const [triggering, setTriggering] = useState(false);
  const [triggerNotice, setTriggerNotice] = useState<string | null>(null);

  // Configuration Preview Modal
  const [previewWfName, setPreviewWfName] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<BackendWorkflowDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Copy feedback
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await pipelineApi.getBackendWorkflows(dataMode);
        setWorkflows(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dataMode]);

  // Load preview details when selected
  useEffect(() => {
    if (!previewWfName) {
      setPreviewDetail(null);
      return;
    }
    async function fetchDetail() {
      setPreviewLoading(true);
      try {
        const detail = await pipelineApi.getWorkflowDetail(previewWfName!, dataMode);
        setPreviewDetail(detail);
      } finally {
        setPreviewLoading(false);
      }
    }
    fetchDetail();
  }, [previewWfName, dataMode]);

  const copyUrl = (wf: BackendWorkflow) => {
    const fullUrl = `${window.location.origin}${wf.webhook.url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedPath(wf.name);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleTrigger = async () => {
    if (!triggerModalWf) return;
    setTriggering(true);
    setTriggerNotice(null);
    try {
      if (isDemoMode) {
        setTriggerNotice('Demo Mode: Simulated trigger queued. Navigating to DAG...');
        setTimeout(() => {
          setTriggerModalWf(null);
          navigate(`/workflows/${triggerModalWf.name}`);
        }, 800);
        return;
      }

      const res = await pipelineApi.triggerWorkflow(triggerModalWf.name, targetBranch);
      setTriggerNotice(`Run ${res.runId} successfully triggered! Redirecting...`);
      setTimeout(() => {
        setTriggerModalWf(null);
        navigate(`/runs/${res.runId}`);
      }, 700);
    } catch (err: any) {
      setTriggerNotice(`Failed to trigger: ${err.message || 'Unknown error'}`);
    } finally {
      setTriggering(false);
    }
  };

  // Filter & Sort
  const filtered = workflows
    .filter((w) => {
      const matchesSearch =
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.webhook.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.trigger?.allowedRepositories?.[0] || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesValidity =
        validityFilter === 'all'
          ? true
          : validityFilter === 'valid'
          ? w.isValid
          : !w.isValid;

      return matchesSearch && matchesValidity;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'jobs') return b.jobCount - a.jobCount;
      if (sortBy === 'activity') return (b.runsCount || 0) - (a.runsCount || 0);
      return 0;
    });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5] font-mono">
              Workflows
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#18191E] text-[#A1A1AA] border border-[#27272A]">
              {workflows.length} configured
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
            Declarative CI/CD pipeline definitions loaded from <code className="text-[#D4D4D8]">workflows/*.json</code> in the engine repository.
          </p>
        </div>
      </div>

      {/* Demo Mode Notice if Active */}
      {isDemoMode && (
        <div className="p-3 bg-[#1A160F] border border-[#3E2B15] rounded-xl flex items-center justify-between text-xs text-[#FDE68A]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>
              <strong>Demo Mode Active:</strong> Showing sample mock workflows. Switch to{' '}
              <strong>Real Mode</strong> in the top bar to inspect live backend workflows.
            </span>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#111317] p-2.5 rounded-xl border border-[#27272A]">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by workflow name, webhook URL, or repository..."
            className="w-full pl-8 pr-4 py-1.5 bg-[#141519] border border-[#27272A] rounded-md text-xs text-[#F4F4F5] placeholder-[#71717A] focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2">
          {/* Validity Filter */}
          <div className="flex items-center gap-1 bg-[#141519] p-0.5 rounded-md border border-[#27272A] text-xs">
            <button
              onClick={() => setValidityFilter('all')}
              className={`px-2 py-1 rounded transition-colors ${
                validityFilter === 'all'
                  ? 'bg-[#22242B] text-[#F4F4F5] font-semibold'
                  : 'text-[#71717A] hover:text-[#D4D4D8]'
              }`}
            >
              All ({workflows.length})
            </button>
            <button
              onClick={() => setValidityFilter('valid')}
              className={`px-2 py-1 rounded transition-colors ${
                validityFilter === 'valid'
                  ? 'bg-[#0D1F17] text-[#34D399] font-semibold border border-[#164E35]'
                  : 'text-[#71717A] hover:text-[#D4D4D8]'
              }`}
            >
              Valid ({workflows.filter((w) => w.isValid).length})
            </button>
            <button
              onClick={() => setValidityFilter('invalid')}
              className={`px-2 py-1 rounded transition-colors ${
                validityFilter === 'invalid'
                  ? 'bg-[#241215] text-[#F87171] font-semibold border border-[#4C1D24]'
                  : 'text-[#71717A] hover:text-[#D4D4D8]'
              }`}
            >
              Invalid ({workflows.filter((w) => !w.isValid).length})
            </button>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#141519] rounded-md border border-[#27272A] text-xs text-[#A1A1AA]">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#71717A]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-[#D4D4D8] focus:outline-none cursor-pointer"
            >
              <option value="name" className="bg-[#141519]">Sort by Name</option>
              <option value="jobs" className="bg-[#141519]">Sort by Job Count</option>
              <option value="activity" className="bg-[#141519]">Sort by Total Runs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <Card variant="surface" className="p-10 text-center border-dashed">
          <div className="w-10 h-10 rounded-lg bg-[#18191E] text-[#A1A1AA] flex items-center justify-center mx-auto mb-2.5">
            <GitBranch className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-[#F4F4F5]">No workflows found</h3>
          <p className="text-xs text-[#71717A] max-w-sm mx-auto mt-1 leading-relaxed">
            {searchQuery
              ? `No workflows matched '${searchQuery}'. Try adjusting your search or filters.`
              : 'No workflows currently loaded. Verify your `workflows/` directory contains valid `.json` configurations.'}
          </p>
        </Card>
      )}

      {/* Workflows Grid - Solid neutral cards */}
      <div className="grid grid-cols-1 gap-3.5">
        {filtered.map((wf) => (
          <Card
            key={wf.name}
            variant="surface"
            className="p-4 rounded-xl border border-[#27272A] hover:border-[#383B46] transition-colors"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left Identity & Topology */}
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#18191E] border border-[#27272A] flex items-center justify-center text-[#3B82F6] shrink-0">
                    <GitBranch className="w-4 h-4" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3
                        onClick={() => navigate(`/workflows/${wf.name}`)}
                        className="text-sm font-bold text-[#F4F4F5] font-mono hover:text-[#3B82F6] transition-colors cursor-pointer"
                      >
                        {wf.name}
                      </h3>

                      {/* Validity Badge */}
                      {wf.isValid ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0D1F17] text-[#34D399] border border-[#164E35]">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Valid Config
                        </span>
                      ) : (
                        <span
                          title={wf.validationErrors.join(', ')}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#241215] text-[#F87171] border border-[#4C1D24] cursor-help"
                        >
                          <AlertCircle className="w-2.5 h-2.5" /> Invalid ({wf.validationErrors.length} errors)
                        </span>
                      )}

                      {/* Last Run Status if available */}
                      {wf.lastRun && (
                        <StatusBadge
                          status={wf.lastRun.status as any}
                          customLabel={`Last: ${wf.lastRun.status}`}
                          size="xs"
                        />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#71717A] mt-0.5 font-mono">
                      <span>{wf.trigger?.allowedRepositories?.[0] || 'Local Engine'}</span>
                      <span>•</span>
                      <span>Branch: {wf.trigger?.allowedBranches?.[0] || 'any'}</span>
                      <span>•</span>
                      <span className="text-[#D4D4D8]">{wf.jobCount} jobs</span>
                      <span>•</span>
                      <span>{wf.runsCount || 0} runs executed</span>
                    </div>
                  </div>
                </div>

                {/* Validation Errors Notice */}
                {!wf.isValid && wf.validationErrors.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#241215] border border-[#4C1D24] text-xs text-[#F87171]">
                    <span className="font-semibold">Configuration issues: </span>
                    {wf.validationErrors.join(' • ')}
                  </div>
                )}

                {/* Badges: Methods, Webhook Path, Events */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-2 py-0.5 rounded bg-[#141519] border border-[#27272A] text-[11px] font-mono text-[#D4D4D8] flex items-center gap-1.5">
                    <span className="text-[#3B82F6] font-semibold">
                      {(wf.webhook.methods || ['POST']).join(' / ')}
                    </span>
                    <span className="text-[#71717A]">{wf.webhook.url}</span>
                  </span>

                  {wf.trigger?.events?.map((ev) => (
                    <span
                      key={ev}
                      className="px-2 py-0.5 rounded bg-[#141519] border border-[#27272A] text-[10px] text-[#A1A1AA] uppercase tracking-wider font-mono"
                    >
                      on: {ev}
                    </span>
                  ))}

                  {wf.environments && wf.environments.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-[#141519] border border-[#27272A] text-[10px] text-[#71717A] font-mono">
                      env: {wf.environments.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 lg:pt-0 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyUrl(wf)}
                  icon={copiedPath === wf.name ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                  title="Copy webhook payload URL"
                >
                  {copiedPath === wf.name ? 'Copied' : 'Copy URL'}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewWfName(wf.name)}
                  icon={<Code2 className="w-3.5 h-3.5" />}
                >
                  Config
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/runs?workflow=${encodeURIComponent(wf.name)}`)}
                  icon={<History className="w-3.5 h-3.5" />}
                >
                  Runs ({wf.runsCount || 0})
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/workflows/${wf.name}`)}
                  icon={<Eye className="w-3.5 h-3.5" />}
                >
                  View DAG
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  disabled={!wf.isValid}
                  onClick={() => {
                    setTriggerModalWf(wf);
                    setTargetBranch(wf.trigger?.allowedBranches?.[0] || 'main');
                    setTriggerNotice(null);
                  }}
                  icon={<Play className="w-3.5 h-3.5" />}
                >
                  Run
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Manual Trigger Confirmation Modal */}
      {triggerModalWf && (
        <Modal
          isOpen={Boolean(triggerModalWf)}
          onClose={() => setTriggerModalWf(null)}
          title={`Trigger Workflow: ${triggerModalWf.name}`}
        >
          <div className="space-y-4">
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              Start an on-demand pipeline run for <code className="text-[#3B82F6] font-mono">{triggerModalWf.name}</code>.
              The backend engine will allocate an isolated temporary workspace and execute configured jobs according to its DAG dependency order.
            </p>

            <div>
              <label className="block text-xs font-medium text-[#D4D4D8] mb-1">
                Target Git Branch:
              </label>
              <input
                type="text"
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#141519] border border-[#27272A] rounded-md text-xs font-mono text-[#F4F4F5] focus:outline-none focus:border-[#3B82F6]"
              />
              <span className="text-[10px] text-[#71717A] mt-1 block">
                Allowed branches:{' '}
                {triggerModalWf.trigger?.allowedBranches?.join(', ') || 'any (default: main)'}
              </span>
            </div>

            {triggerNotice && (
              <div
                className={`p-3 rounded-md text-xs font-mono ${
                  triggerNotice.includes('Failed')
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
                onClick={() => setTriggerModalWf(null)}
                disabled={triggering}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={triggering}
                onClick={handleTrigger}
                icon={<Play className="w-3.5 h-3.5" />}
              >
                Confirm &amp; Run
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Structured Configuration Preview Modal */}
      {previewWfName && (
        <Modal
          isOpen={Boolean(previewWfName)}
          onClose={() => setPreviewWfName(null)}
          title={`Configuration Preview: ${previewWfName}`}
        >
          {previewLoading || !previewDetail ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 text-xs">
              {/* Webhook Endpoint */}
              <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
                <span className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-mono">
                  Webhook Endpoint
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#D4D4D8] font-mono text-[11px]">
                  <div>
                    <span className="text-[#71717A]">Path: </span>
                    <span>{previewDetail.workflow.webhook.url}</span>
                  </div>
                  <div>
                    <span className="text-[#71717A]">Methods: </span>
                    <span>{(previewDetail.workflow.webhook.methods || ['POST']).join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-[#71717A]">Allowed Repos: </span>
                    <span>{previewDetail.workflow.trigger?.allowedRepositories?.join(', ') || 'Any'}</span>
                  </div>
                  <div>
                    <span className="text-[#71717A]">Allowed Branches: </span>
                    <span>{previewDetail.workflow.trigger?.allowedBranches?.join(', ') || 'Any'}</span>
                  </div>
                </div>
              </div>

              {/* Jobs and Steps Breakdown */}
              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-[#F4F4F5] uppercase tracking-wider font-mono">
                  Configured Jobs ({previewDetail.jobCount})
                </span>
                <div className="space-y-2">
                  {Object.entries(previewDetail.workflow.jobs || {}).map(([jobId, job]: [string, any]) => (
                    <div
                      key={jobId}
                      className="p-3 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#F4F4F5] font-mono text-xs">{jobId}</span>
                          {job.needs && job.needs.length > 0 && (
                            <span className="text-[10px] text-[#71717A] font-mono">
                              needs: [{job.needs.join(', ')}]
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#71717A] font-mono">
                          {job.steps?.length || 0} steps
                        </span>
                      </div>

                      {/* Steps List */}
                      <div className="space-y-1 pl-2 border-l border-[#27272A]">
                        {job.steps?.map((step: any, sIdx: number) => (
                          <div key={sIdx} className="text-[11px] font-mono text-[#D4D4D8] flex items-start gap-2">
                            <span className="text-[#71717A]">{sIdx + 1}.</span>
                            <div>
                              <span className="text-[#F4F4F5]">{step.name}</span>
                              {step.run && (
                                <code className="block text-[10px] text-[#71717A] bg-[#0B0C0E] px-1.5 py-0.5 rounded mt-0.5 truncate max-w-lg">
                                  {step.run}
                                </code>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Environments Notice */}
              {previewDetail.workflow.environments && (
                <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] space-y-1">
                  <span className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-mono">
                    Target Environments
                  </span>
                  <div className="text-[11px] font-mono text-[#71717A]">
                    {Object.entries(previewDetail.workflow.environments).map(([envName, envConf]: [string, any]) => (
                      <div key={envName}>
                        <span className="text-[#D4D4D8] font-medium">{envName}: </span>
                        <span>health check: {envConf.healthUrl || 'None configured'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};
