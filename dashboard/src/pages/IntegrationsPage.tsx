import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Server,
  Network,
  GitBranch,
  Key,
  Globe,
  Radio,
  ExternalLink,
  RefreshCw,
  Terminal,
  Activity,
  Layers,
  Lock
} from 'lucide-react';
import { pipelineApi } from '../api/client';
import { IntegrationsReadiness, BackendWorkflow } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { useDataMode } from '../context/DataModeContext';

export const IntegrationsPage: React.FC = () => {
  const { dataMode, isDemoMode } = useDataMode();
  const [readiness, setReadiness] = useState<IntegrationsReadiness | null>(null);
  const [workflows, setWorkflows] = useState<BackendWorkflow[]>([]);
  const [selectedWorkflowName, setSelectedWorkflowName] = useState<string>('day7-live-github');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Copy URL state
  const [copiedUrl, setCopiedUrl] = useState(false);

  // GitHub Connectivity Check
  const [verifyingGithub, setVerifyingGithub] = useState(false);
  const [githubVerifyResult, setGithubVerifyResult] = useState<{
    verified: boolean;
    authenticatedUser?: string;
    rateLimitRemaining?: string;
    scopes?: string[];
    reason?: string;
    message?: string;
  } | null>(null);

  const loadData = async () => {
    try {
      const [rData, wfData] = await Promise.all([
        pipelineApi.getIntegrationsReadiness(dataMode),
        pipelineApi.getBackendWorkflows(dataMode)
      ]);
      setReadiness(rData);
      setWorkflows(wfData);
      if (wfData.length > 0 && !selectedWorkflowName) {
        setSelectedWorkflowName(wfData[0].name);
      }
    } catch {
      // Offline fallback
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

  const handleVerifyGithub = async () => {
    setVerifyingGithub(true);
    setGithubVerifyResult(null);
    try {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 600));
        setGithubVerifyResult({
          verified: true,
          authenticatedUser: 'octocat-demo',
          rateLimitRemaining: '4998',
          scopes: ['repo:status', 'public_repo'],
          message: "Demo Mode: GitHub connection simulated as 'octocat-demo'."
        });
        return;
      }
      const res = await pipelineApi.verifyGitHubConnection();
      setGithubVerifyResult(res);
    } catch (err: any) {
      setGithubVerifyResult({
        verified: false,
        reason: err.message || 'Verification request failed'
      });
    } finally {
      setVerifyingGithub(false);
    }
  };

  // Construct actual payload URL
  const selectedWf = workflows.find((w) => w.name === selectedWorkflowName) || workflows[0];
  const webhookPath = selectedWf ? selectedWf.webhook.url : '/webhooks/github';

  const hasPublicUrl = Boolean(readiness?.publicWebhookBaseUrl);
  const constructedWebhookUrl = hasPublicUrl
    ? `${readiness?.publicWebhookBaseUrl?.replace(/\/$/, '')}${webhookPath}`
    : `http://localhost:${readiness?.port || '3000'}${webhookPath}`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(constructedWebhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (loading || !readiness) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            GitHub Integration & Setup Guide
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            End-to-end interactive setup guide to connect your GitHub repository with this self-hosted CI/CD Engine.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          isLoading={refreshing}
          onClick={handleRefresh}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Check Readiness
        </Button>
      </div>

      {/* SECTION A — Engine Readiness Dashboard */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Section A — Engine Core Readiness
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Backend Server Online/Offline */}
          <Card variant="surface" className="p-4 rounded-xl border-[#1b2b48]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Backend Server</span>
              <StatusBadge
                status={readiness.backendOnline ? 'online' : 'failed'}
                size="xs"
              />
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {readiness.backendOnline ? `Port :${readiness.port}` : 'Offline'}
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">
              {readiness.backendOnline ? 'Express HTTP engine active' : 'Run `npm run dev` to start'}
            </span>
          </Card>

          {/* 2. Loaded Workflows */}
          <Card variant="surface" className="p-4 rounded-xl border-[#1b2b48]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Loaded Workflows</span>
              <GitBranch className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {readiness.loadedWorkflowsCount}
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">
              Active pipelines in `workflows/`
            </span>
          </Card>

          {/* 3. GitHub Credentials Status */}
          <Card variant="surface" className="p-4 rounded-xl border-[#1b2b48]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">GitHub Status Token</span>
              {readiness.githubTokenConfigured ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Configured
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Not Configured
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-slate-200 font-mono truncate">
              {readiness.githubTokenConfigured ? 'Token Present in .env' : 'Missing in .env'}
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">
              GITHUB_TOKEN (never transmitted)
            </span>
          </Card>

          {/* 4. Public Webhook Base URL */}
          <Card variant="surface" className="p-4 rounded-xl border-[#1b2b48]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Public Webhook URL</span>
              {hasPublicUrl ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Configured
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Local Only
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-slate-200 font-mono truncate" title={readiness.publicWebhookBaseUrl || 'Not configured'}>
              {readiness.publicWebhookBaseUrl ? readiness.publicWebhookBaseUrl : 'http://localhost:3000'}
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 block">
              {hasPublicUrl ? 'Public tunnel ready' : 'Configure PUBLIC_WEBHOOK_BASE_URL'}
            </span>
          </Card>
        </div>
      </div>

      {/* SECTION B — GitHub Webhook Setup Guide */}
      <Card variant="surface" className="p-6 rounded-2xl border-[#1b2b48] bg-gradient-to-br from-[#0c152a] to-[#070b16] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-white shrink-0 shadow-lg">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">
                Section B — Step-by-Step GitHub Webhook Setup
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Connect your repository to the engine so pushes automatically trigger pipeline execution with cryptographic HMAC-SHA256 signature verification.
              </p>
            </div>
          </div>

          {/* Workflow Target Picker */}
          <div className="flex items-center gap-2 bg-[#060a14] px-3 py-1.5 rounded-xl border border-[#1b2b48] text-xs font-mono">
            <span className="text-slate-400">Target Pipeline:</span>
            <select
              value={selectedWorkflowName}
              onChange={(e) => setSelectedWorkflowName(e.target.value)}
              className="bg-transparent text-sky-300 font-bold focus:outline-none cursor-pointer"
            >
              {workflows.map((w) => (
                <option key={w.name} value={w.name} className="bg-[#0b1325] text-slate-200">
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Public Base URL Notice if Local Only */}
        {!hasPublicUrl && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Public Webhook Base URL Missing:</strong> The generated payload URL currently uses <code className="text-white">localhost</code>.
              For GitHub to deliver live webhooks from GitHub.com, start a secure tunnel using <code className="text-white">npm run tunnel</code> (or <code className="text-white">ngrok http 3000</code>) and add <code className="text-white">PUBLIC_WEBHOOK_BASE_URL=https://&lt;your-id&gt;.ngrok-free.app</code> to your <code className="text-white">.env</code>.
            </div>
          </div>
        )}

        {/* Payload URL Box with Copy */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">
            1. GitHub Webhook Payload URL for <code className="text-sky-300">{selectedWorkflowName}</code>:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={constructedWebhookUrl}
              className="w-full px-3.5 py-2.5 bg-[#060a14] border border-[#1c2c49] rounded-xl text-xs font-mono text-sky-200 focus:outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={copyWebhookUrl}
              icon={copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            >
              {copiedUrl ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* 10 Detailed Setup Steps */}
        <div className="space-y-3 pt-4 border-t border-[#182640]">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
            Configuration Steps in GitHub Repository Settings:
          </h3>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">1.</span> Open your GitHub repository in your browser.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">2.</span> Navigate to <strong>Settings</strong> → <strong>Webhooks</strong>.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">3.</span> Click the <strong>Add webhook</strong> button.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">4.</span> Paste the Payload URL copied above into <strong>Payload URL</strong>.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">5.</span> Set Content type to <code className="text-sky-300">application/json</code>.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">6.</span> Enter your <code className="text-sky-300">GITHUB_WEBHOOK_SECRET</code> configured in <code className="text-slate-300">.env</code>.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">7.</span> Set SSL verification to <strong>Enable SSL verification</strong>.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">8.</span> Select <strong>Just the push event</strong> (or individual events matching your trigger).
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">9.</span> Click <strong>Add webhook</strong> to save.
            </li>
            <li className="p-3 rounded-xl bg-[#080d19] border border-[#18263f]">
              <span className="font-bold text-sky-400 mr-1.5">10.</span> Push a commit to your branch and inspect the execution in this dashboard!
            </li>
          </ol>
        </div>
      </Card>

      {/* SECTION C — Configuration Readiness Checklist */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Section C — Configuration Checklist
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Check 1: Backend */}
          <div className="p-3.5 rounded-xl bg-[#0a101f] border border-[#1b2b48] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {readiness.backendOnline ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <div>
                <span className="font-bold text-white font-mono">Backend Engine Server</span>
                <p className="text-[11px] text-slate-400 mt-0.5">Listening on port {readiness.port}</p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">
              {readiness.backendOnline ? 'ONLINE' : 'STOPPED'}
            </span>
          </div>

          {/* Check 2: Webhook Secret */}
          <div className="p-3.5 rounded-xl bg-[#0a101f] border border-[#1b2b48] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {readiness.githubWebhookSecretConfigured ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <div>
                <span className="font-bold text-white font-mono">Webhook HMAC Secret</span>
                <p className="text-[11px] text-slate-400 mt-0.5">GITHUB_WEBHOOK_SECRET in .env</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono font-bold ${readiness.githubWebhookSecretConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
              {readiness.githubWebhookSecretConfigured ? 'CONFIGURED' : 'NOT SET'}
            </span>
          </div>

          {/* Check 3: GitHub Token */}
          <div className="p-3.5 rounded-xl bg-[#0a101f] border border-[#1b2b48] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {readiness.githubTokenConfigured ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <div>
                <span className="font-bold text-white font-mono">GitHub Status Token</span>
                <p className="text-[11px] text-slate-400 mt-0.5">GITHUB_TOKEN for commit status reports</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono font-bold ${readiness.githubTokenConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
              {readiness.githubTokenConfigured ? 'CONFIGURED' : 'NOT SET'}
            </span>
          </div>

          {/* Check 4: Public Webhook Base URL */}
          <div className="p-3.5 rounded-xl bg-[#0a101f] border border-[#1b2b48] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {hasPublicUrl ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <div>
                <span className="font-bold text-white font-mono">Public Ingestion Tunnel</span>
                <p className="text-[11px] text-slate-400 mt-0.5">PUBLIC_WEBHOOK_BASE_URL (ngrok / domain)</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono font-bold ${hasPublicUrl ? 'text-emerald-400' : 'text-amber-400'}`}>
              {hasPublicUrl ? 'CONFIGURED' : 'OPTIONAL (LOCAL)'}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION D — GitHub Commit Status Explanation & Verification */}
      <Card variant="surface" className="p-6 rounded-2xl border-[#1b2b48] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              Section D — GitHub Commit Status Reporting
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              When a push triggers a pipeline, the engine communicates with the GitHub REST API to post commit statuses directly to the commit SHA.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            isLoading={verifyingGithub}
            onClick={handleVerifyGithub}
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
          >
            Verify GitHub API Connectivity
          </Button>
        </div>

        {/* Verification Result Banner */}
        {githubVerifyResult && (
          <div
            className={`p-4 rounded-xl border text-xs font-mono space-y-1 ${
              githubVerifyResult.verified
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                : 'bg-red-950/30 border-red-500/30 text-red-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              {githubVerifyResult.verified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>GitHub Authentication Verified: {githubVerifyResult.authenticatedUser}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>Verification Failed: {githubVerifyResult.reason}</span>
                </>
              )}
            </div>
            {githubVerifyResult.verified && (
              <p className="text-[11px] text-emerald-300/80">
                Rate limit remaining: {githubVerifyResult.rateLimitRemaining || 'N/A'} • Token scopes: [{githubVerifyResult.scopes?.join(', ') || 'none'}]
              </p>
            )}
          </div>
        )}

        {/* Visual Mockup of GitHub Commit Statuses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-[#060a14] border border-amber-500/30 space-y-1">
            <span className="text-amber-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              State: pending
            </span>
            <p className="text-[11px] text-slate-400">Sent immediately when webhook is received and jobs begin execution.</p>
          </div>

          <div className="p-3 rounded-xl bg-[#060a14] border border-emerald-500/30 space-y-1">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              State: success
            </span>
            <p className="text-[11px] text-slate-400">Sent when all pipeline jobs complete with zero non-zero exit codes.</p>
          </div>

          <div className="p-3 rounded-xl bg-[#060a14] border border-red-500/30 space-y-1">
            <span className="text-red-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              State: failure
            </span>
            <p className="text-[11px] text-slate-400">Sent when any step fails or times out during execution.</p>
          </div>

          <div className="p-3 rounded-xl bg-[#060a14] border border-red-700/30 space-y-1">
            <span className="text-red-300 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-700" />
              State: error
            </span>
            <p className="text-[11px] text-slate-400">Sent if an internal engine scheduler exception or crash occurs.</p>
          </div>
        </div>
      </Card>

      {/* SECTION E — Getting Started Onboarding Sequence */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Section E — Developer Getting Started Guide
          </h2>
        </div>

        <Card variant="surface" className="p-5 rounded-2xl border-[#1b2b48] space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Quick sequence of verified commands from <code className="text-sky-300">package.json</code> to start and test this engine on any machine:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-[#060a14] border border-[#17253e] space-y-1.5">
              <span className="text-sky-400 font-bold">1. Start Backend Engine</span>
              <code className="block p-2 rounded bg-black text-slate-200 select-all">
                npm run dev
              </code>
              <span className="text-[10px] text-slate-500 block">Runs server on port 3000 with watcher</span>
            </div>

            <div className="p-3 rounded-xl bg-[#060a14] border border-[#17253e] space-y-1.5">
              <span className="text-sky-400 font-bold">2. Start Dashboard</span>
              <code className="block p-2 rounded bg-black text-slate-200 select-all">
                npm run dashboard:dev
              </code>
              <span className="text-[10px] text-slate-500 block">Vite UI dev server on http://localhost:5174</span>
            </div>

            <div className="p-3 rounded-xl bg-[#060a14] border border-[#17253e] space-y-1.5">
              <span className="text-sky-400 font-bold">3. Start Ngrok Tunnel</span>
              <code className="block p-2 rounded bg-black text-slate-200 select-all">
                npm run tunnel
              </code>
              <span className="text-[10px] text-slate-500 block">Exposes port 3000 publicly for GitHub webhooks</span>
            </div>
          </div>
        </Card>
      </div>

      {/* SECTION F — Recent Webhook Deliveries (Live Metadata) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">
            Section F — Recent Webhook Deliveries ({readiness.recentDeliveries.length})
          </h2>
        </div>

        <Card variant="surface" className="overflow-hidden border-[#1b2b48]">
          {readiness.recentDeliveries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">
              No webhook deliveries recorded since server startup. Push to your repository to see deliveries appear in real time.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0b1324] text-slate-400 border-b border-[#1b2b48]">
                  <tr>
                    <th className="p-3">Delivery ID</th>
                    <th className="p-3">Workflow</th>
                    <th className="p-3">Repository</th>
                    <th className="p-3">Branch / Commit</th>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#132038]">
                  {readiness.recentDeliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-[#0c162a] text-slate-300">
                      <td className="p-3 text-sky-400 font-bold truncate max-w-[140px]" title={del.id}>
                        {del.id}
                      </td>
                      <td className="p-3 font-semibold text-white">{del.workflowName}</td>
                      <td className="p-3 text-slate-400">{del.repository}</td>
                      <td className="p-3">
                        <span className="text-slate-200">{del.branch}</span>
                        <span className="text-slate-500"> @ {del.commitSha.slice(0, 7)}</span>
                      </td>
                      <td className="p-3 text-slate-500">{new Date(del.timestamp).toLocaleTimeString()}</td>
                      <td className="p-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            del.status === 'accepted'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {del.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
