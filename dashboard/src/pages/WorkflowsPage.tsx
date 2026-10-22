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
  Filter,
  ArrowUpDown,
  Code2,
  Box,
  Layers,
  ShieldCheck,
  X
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
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
              Workflows
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {workflows.length} configured
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Declarative CI/CD pipeline definitions loaded from{' '}
            <code className="text-slate-300">workflows/*.json</code> in the engine repository.
          </p>
        </div>
      </div>

      {/* Demo Mode Notice if Active */}
      {isDemoMode && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Demo Mode Active:</strong> Showing sample mock workflows. Switch to{' '}
              <strong>Real Mode</strong> in the top bar to inspect live backend workflows.
            </span>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0a101f] p-3 rounded-2xl border border-[#1b2b48]">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by workflow name, webhook URL, or repository..."
            className="w-full pl-9 pr-4 py-2 bg-[#060a14] border border-[#17243c] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50"
          />
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2">
          {/* Validity Filter */}
          <div className="flex items-center gap-1 bg-[#060a14] p-1 rounded-xl border border-[#17243c] text-xs">
            <button
              onClick={() => setValidityFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                validityFilter === 'all'
                  ? 'bg-sky-500/20 text-sky-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({workflows.length})
            </button>
            <button
              onClick={() => setValidityFilter('valid')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                validityFilter === 'valid'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Valid ({workflows.filter((w) => w.isValid).length})
            </button>
            <button
              onClick={() => setValidityFilter('invalid')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                validityFilter === 'invalid'
                  ? 'bg-red-500/20 text-red-300 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Invalid ({workflows.filter((w) => !w.isValid).length})
            </button>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#060a14] rounded-xl border border-[#17243c] text-xs text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="name" className="bg-[#0b1325]">Sort by Name</option>
              <option value="jobs" className="bg-[#0b1325]">Sort by Job Count</option>
              <option value="activity" className="bg-[#0b1325]">Sort by Total Runs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <Card variant="surface" className="p-12 text-center border-dashed border-[#203254]">
          <div className="w-12 h-12 rounded-2xl bg-[#12223a] text-sky-400 flex items-center justify-center mx-auto mb-3">
            <GitBranch className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white font-mono">No workflows found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
            {searchQuery
              ? `No workflows matched '${searchQuery}'. Try adjusting your search or filters.`
              : 'No workflows currently loaded. Verify your `workflows/` directory contains valid `.json` configurations.'}
          </p>
        </Card>
      )}

      {/* Workflows Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.map((wf) => (
          <Card
            key={wf.name}
            variant="surface"
            className={`p-5 rounded-2xl transition-all border ${
              wf.isValid
                ? 'border-[#1b2b48] hover:border-sky-500/40 bg-gradient-to-r from-[#0a101f] to-[#070b16]'
                : 'border-red-500/30 hover:border-red-500/50 bg-[#120a0d]'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left Identity & Topology */}
              <div className="space-y-2.5 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#101c34] border border-[#20355f] flex items-center justify-center text-sky-400 shrink-0">
                    <GitBranch className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3
                        onClick={() => navigate(`/workflows/${wf.name}`)}
                        className="text-base font-bold text-white font-mono hover:text-sky-300 transition-colors cursor-pointer"
                      >
                        {wf.name}
                      </h3>

                      {/* Validity Badge */}
                      {wf.isValid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Valid Config
                        </span>
                      ) : (
                        <span
                          title={wf.validationErrors.join(', ')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 cursor-help"
                        >
                          <AlertCircle className="w-3 h-3" /> Invalid ({wf.validationErrors.length} errors)
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

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-0.5 font-mono">
                      <span>{wf.trigger?.allowedRepositories?.[0] || 'Local Engine'}</span>
                      <span className="text-slate-600">•</span>
                      <span>Branch: {wf.trigger?.allowedBranches?.[0] || 'any'}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-300 font-semibold">{wf.jobCount} jobs</span>
                      <span className="text-slate-600">•</span>
                      <span>{wf.runsCount || 0} runs executed</span>
                    </div>
                  </div>
                </div>

                {/* Validation Errors Notice */}
                {!wf.isValid && wf.validationErrors.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/20 text-xs text-red-300">
                    <span className="font-semibold">Configuration issues: </span>
                    {wf.validationErrors.join(' • ')}
                  </div>
                )}

                {/* Badges: Methods, Webhook Path, Events */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-2.5 py-1 rounded-lg bg-[#0e172a] border border-[#1b2b48] text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                    <span className="text-sky-400 font-bold">
                      {(wf.webhook.methods || ['POST']).join(' / ')}
                    </span>
                    <span className="text-slate-400">{wf.webhook.url}</span>
                  </span>

                  {wf.trigger?.events?.map((ev) => (
                    <span
                      key={ev}
                      className="px-2 py-0.5 rounded-md bg-[#111f37] border border-[#21355c] text-[10px] text-sky-300 uppercase tracking-wider font-mono font-medium"
                    >
                      on: {ev}
                    </span>
                  ))}

                  {wf.environments && wf.environments.length > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-[#19192b] border border-[#2e2e50] text-[10px] text-indigo-300 font-mono">
                      env: {wf.environments.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyUrl(wf)}
                  icon={copiedPath === wf.name ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
            <p className="text-xs text-slate-300 leading-relaxed">
              Start an on-demand pipeline run for <code className="text-sky-300">{triggerModalWf.name}</code>.
              The backend engine will allocate an isolated temporary workspace and execute configured jobs according to its DAG dependency order.
            </p>

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
              <span className="text-[10px] text-slate-500 mt-1 block">
                Allowed branches:{' '}
                {triggerModalWf.trigger?.allowedBranches?.join(', ') || 'any (default: main)'}
              </span>
            </div>

            {triggerNotice && (
              <div
                className={`p-3 rounded-xl text-xs font-mono ${
                  triggerNotice.includes('Failed')
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
                Confirm & Run
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Structured Configuration Preview Modal (Safe: No Secrets) */}
      {previewWfName && (
        <Modal
          isOpen={Boolean(previewWfName)}
          onClose={() => setPreviewWfName(null)}
          title={`Configuration Preview: ${previewWfName}`}
        >
          {previewLoading || !previewDetail ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1 text-xs">
              {/* Identity & Webhook */}
              <div className="p-3.5 rounded-xl bg-[#09101f] border border-[#1b2b48] space-y-2">
                <span className="text-xs font-bold text-sky-300 uppercase tracking-wider font-mono">
                  Webhook Endpoint
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500">Path: </span>
                    <span>{previewDetail.workflow.webhook.url}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Methods: </span>
                    <span>{(previewDetail.workflow.webhook.methods || ['POST']).join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Allowed Repos: </span>
                    <span>{previewDetail.workflow.trigger?.allowedRepositories?.join(', ') || 'Any'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Allowed Branches: </span>
                    <span>{previewDetail.workflow.trigger?.allowedBranches?.join(', ') || 'Any'}</span>
                  </div>
                </div>
              </div>

              {/* Jobs and Steps Breakdown */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Configured Jobs ({previewDetail.jobCount})
                </span>
                <div className="space-y-2.5">
                  {Object.entries(previewDetail.workflow.jobs || {}).map(([jobId, job]: [string, any]) => (
                    <div
                      key={jobId}
                      className="p-3.5 rounded-xl bg-[#080d19] border border-[#182640] space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sky-400 font-mono text-xs">{jobId}</span>
                          {job.needs && job.needs.length > 0 && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              needs: [{job.needs.join(', ')}]
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {job.steps?.length || 0} steps
                        </span>
                      </div>

                      {/* Steps List */}
                      <div className="space-y-1.5 pl-2 border-l border-[#1d2f50]">
                        {job.steps?.map((step: any, sIdx: number) => (
                          <div key={sIdx} className="text-[11px] font-mono text-slate-300 flex items-start gap-2">
                            <span className="text-slate-500">{sIdx + 1}.</span>
                            <div>
                              <span className="text-slate-200 font-semibold">{step.name}</span>
                              {step.run && (
                                <code className="block text-[10px] text-slate-400 bg-[#040810] px-2 py-0.5 rounded mt-0.5 truncate max-w-lg">
                                  {step.run}
                                </code>
                              )}
                              {step.script && (
                                <code className="block text-[10px] text-indigo-300 bg-[#040810] px-2 py-0.5 rounded mt-0.5 truncate max-w-lg">
                                  script: {step.script}
                                </code>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Artifacts if configured */}
                      {job.artifacts && (
                        <div className="pt-1.5 border-t border-[#131e33] text-[10px] text-slate-400 font-mono">
                          {job.artifacts.upload && (
                            <span>Upload: {job.artifacts.upload.map((u: any) => u.name).join(', ')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Environments Notice (No secrets!) */}
              {previewDetail.workflow.environments && (
                <div className="p-3 rounded-xl bg-[#09101f] border border-[#1b2b48] space-y-1">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                    Target Environments
                  </span>
                  <div className="text-[11px] font-mono text-slate-400">
                    {Object.entries(previewDetail.workflow.environments).map(([envName, envConf]: [string, any]) => (
                      <div key={envName}>
                        <span className="text-sky-300 font-semibold">{envName}: </span>
                        <span>health check: {envConf.healthUrl || 'None configured'}</span>
                        <span className="ml-2 text-slate-500">
                          (Secrets: Masked & securely stored in runtime)
                        </span>
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
