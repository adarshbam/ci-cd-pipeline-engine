import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Server,
  Network,
  GitBranch,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  Terminal,
  Activity,
  ArrowRight
} from 'lucide-react';
import { pipelineApi } from '../api/client';
import { IntegrationsReadiness, BackendWorkflow } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { useDataMode } from '../context/DataModeContext';

export const IntegrationsPage: React.FC = () => {
  const navigate = useNavigate();
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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5] font-mono">
            GitHub Integration &amp; Setup Guide
          </h1>
          <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
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
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-[#3B82F6]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
            Section A — Engine Core Readiness
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Backend Server Online/Offline */}
          <Card variant="surface" className="p-3.5 rounded-xl border-[#27272A]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#A1A1AA] font-medium">Backend Server</span>
              <StatusBadge
                status={readiness.backendOnline ? 'online' : 'failed'}
                size="xs"
              />
            </div>
            <div className="text-lg font-bold text-[#F4F4F5] font-mono">
              {readiness.backendOnline ? `Port :${readiness.port}` : 'Offline'}
            </div>
            <span className="text-[10px] text-[#71717A] font-mono mt-1 block">
              {readiness.backendOnline ? 'Express HTTP engine active' : 'Run `npm run dev` to start'}
            </span>
          </Card>

          {/* 2. Loaded Workflows */}
          <Card variant="surface" className="p-3.5 rounded-xl border-[#27272A]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#A1A1AA] font-medium">Loaded Workflows</span>
              <GitBranch className="w-3.5 h-3.5 text-[#3B82F6]" />
            </div>
            <div className="text-lg font-bold text-[#F4F4F5] font-mono">
              {readiness.loadedWorkflowsCount}
            </div>
            <span className="text-[10px] text-[#71717A] font-mono mt-1 block">
              Active pipelines in `workflows/`
            </span>
          </Card>

          {/* 3. GitHub Credentials Status */}
          <Card variant="surface" className="p-3.5 rounded-xl border-[#27272A]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#A1A1AA] font-medium">GitHub Status Token</span>
              {readiness.githubTokenConfigured ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0D1F17] text-[#34D399] border border-[#164E35]">
                  Configured
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#241A0E] text-[#FBBF24] border border-[#4C3415]">
                  Not Configured
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-[#D4D4D8] font-mono truncate">
              {readiness.githubTokenConfigured ? 'Token Present in .env' : 'Missing in .env'}
            </div>
            <span className="text-[10px] text-[#71717A] font-mono mt-1 block">
              GITHUB_TOKEN (never transmitted)
            </span>
          </Card>

          {/* 4. Public Webhook Base URL */}
          <Card variant="surface" className="p-3.5 rounded-xl border-[#27272A]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#A1A1AA] font-medium">Public Webhook URL</span>
              {hasPublicUrl ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0D1F17] text-[#34D399] border border-[#164E35]">
                  Configured
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#241A0E] text-[#FBBF24] border border-[#4C3415]">
                  Local Only
                </span>
              )}
            </div>
            <div className="text-xs font-semibold text-[#D4D4D8] font-mono truncate" title={readiness.publicWebhookBaseUrl || 'Not configured'}>
              {readiness.publicWebhookBaseUrl ? readiness.publicWebhookBaseUrl : 'http://localhost:3000'}
            </div>
            <span className="text-[10px] text-[#71717A] font-mono mt-1 block">
              {hasPublicUrl ? 'Public tunnel ready' : 'Configure PUBLIC_WEBHOOK_BASE_URL'}
            </span>
          </Card>
        </div>
      </div>

      {/* SECTION B — GitHub Webhook Setup Guide */}
      <Card variant="surface" className="p-5 rounded-xl border-[#27272A] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#18191E] border border-[#27272A] flex items-center justify-center text-[#F4F4F5] shrink-0">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#F4F4F5] font-mono">
                Section B — Step-by-Step GitHub Webhook Setup
              </h2>
              <p className="text-xs text-[#A1A1AA] mt-1 max-w-2xl leading-relaxed">
                Connect your repository to the engine so git pushes automatically trigger pipeline execution with HMAC-SHA256 signature verification.
              </p>
            </div>
          </div>

          {/* Workflow Target Picker */}
          <div className="flex items-center gap-2 bg-[#141519] px-2.5 py-1.5 rounded-md border border-[#27272A] text-xs font-mono">
            <span className="text-[#71717A]">Target Pipeline:</span>
            <select
              value={selectedWorkflowName}
              onChange={(e) => setSelectedWorkflowName(e.target.value)}
              className="bg-transparent text-[#3B82F6] font-semibold focus:outline-none cursor-pointer"
            >
              {workflows.map((w) => (
                <option key={w.name} value={w.name} className="bg-[#141519] text-[#D4D4D8]">
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Public Base URL Notice if Local Only */}
        {!hasPublicUrl && (
          <div className="p-3 rounded-lg bg-[#1A160F] border border-[#3E2B15] flex items-start gap-2.5 text-xs text-[#FDE68A] leading-relaxed">
            <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
            <div>
              <strong>Public Ingestion Tunnel Missing:</strong> The generated payload URL currently uses <code className="text-white">localhost</code>.
              For GitHub to deliver live webhooks from GitHub.com, run <code className="text-white">npm run tunnel</code> and add <code className="text-white">PUBLIC_WEBHOOK_BASE_URL=https://&lt;id&gt;.ngrok-free.app</code> to your <code className="text-white">.env</code>.
            </div>
          </div>
        )}

        {/* Payload URL Box with Copy */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#D4D4D8]">
            1. Webhook Payload URL for <code className="text-[#3B82F6] font-mono">{selectedWorkflowName}</code>:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={constructedWebhookUrl}
              className="w-full px-3 py-1.5 bg-[#0B0C0E] border border-[#27272A] rounded-md text-xs font-mono text-[#D4D4D8] focus:outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={copyWebhookUrl}
              icon={copiedUrl ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copiedUrl ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Setup Steps */}
        <div className="space-y-2.5 pt-3 border-t border-[#27272A]">
          <h3 className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-mono">
            Configuration Steps in GitHub Repository Settings:
          </h3>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[#D4D4D8]">
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">1.</span> Open your GitHub repository in your browser.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">2.</span> Navigate to <strong>Settings</strong> → <strong>Webhooks</strong>.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">3.</span> Click the <strong>Add webhook</strong> button.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">4.</span> Paste the Payload URL copied above.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">5.</span> Set Content type to <code className="text-[#3B82F6]">application/json</code>.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">6.</span> Enter your <code className="text-[#3B82F6]">GITHUB_WEBHOOK_SECRET</code> from <code className="text-[#A1A1AA]">.env</code>.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">7.</span> Set SSL verification to <strong>Enable SSL verification</strong>.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">8.</span> Select <strong>Just the push event</strong>.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">9.</span> Click <strong>Add webhook</strong> to save.
            </li>
            <li className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A]">
              <span className="font-semibold text-[#3B82F6] mr-1.5">10.</span> Push a commit to your branch and inspect the live execution.
            </li>
          </ol>
        </div>
      </Card>

      {/* SECTION C — Configuration Readiness Checklist */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
            Section C — Configuration Checklist
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
          {/* Check 1: Backend */}
          <div className="p-3 rounded-lg bg-[#111317] border border-[#27272A] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {readiness.backendOnline ? (
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
              )}
              <div>
                <span className="font-semibold text-[#F4F4F5] font-mono">Backend Engine Server</span>
                <p className="text-[11px] text-[#71717A] mt-0.5">Listening on port {readiness.port}</p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-[#34D399] font-semibold">
              {readiness.backendOnline ? 'ONLINE' : 'STOPPED'}
            </span>
          </div>

          {/* Check 2: Webhook Secret */}
          <div className="p-3 rounded-lg bg-[#111317] border border-[#27272A] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {readiness.githubWebhookSecretConfigured ? (
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
              )}
              <div>
                <span className="font-semibold text-[#F4F4F5] font-mono">Webhook HMAC Secret</span>
                <p className="text-[11px] text-[#71717A] mt-0.5">GITHUB_WEBHOOK_SECRET in .env</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono font-semibold ${readiness.githubWebhookSecretConfigured ? 'text-[#34D399]' : 'text-[#FBBF24]'}`}>
              {readiness.githubWebhookSecretConfigured ? 'CONFIGURED' : 'NOT SET'}
            </span>
          </div>

          {/* Check 3: GitHub Token */}
          <div className="p-3 rounded-lg bg-[#111317] border border-[#27272A] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {readiness.githubTokenConfigured ? (
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
              )}
              <div>
                <span className="font-semibold text-[#F4F4F5] font-mono">GitHub Status Token</span>
                <p className="text-[11px] text-[#71717A] mt-0.5">GITHUB_TOKEN for status reports</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono font-semibold ${readiness.githubTokenConfigured ? 'text-[#34D399]' : 'text-[#FBBF24]'}`}>
              {readiness.githubTokenConfigured ? 'CONFIGURED' : 'NOT SET'}
            </span>
          </div>

          {/* Check 4: Public Webhook Base URL */}
          <div className="p-3 rounded-lg bg-[#111317] border border-[#27272A] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {hasPublicUrl ? (
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
              )}
              <div>
                <span className="font-semibold text-[#F4F4F5] font-mono">Public Ingestion Tunnel</span>
                <p className="text-[11px] text-[#71717A] mt-0.5">PUBLIC_WEBHOOK_BASE_URL (ngrok / host)</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono font-semibold ${hasPublicUrl ? 'text-[#34D399]' : 'text-[#71717A]'}`}>
              {hasPublicUrl ? 'CONFIGURED' : 'OPTIONAL (LOCAL)'}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION D — GitHub Commit Status Explanation & Verification */}
      <Card variant="surface" className="p-5 rounded-xl border-[#27272A] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F4F4F5] font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#3B82F6]" />
              Section D — GitHub Commit Status Reporting
            </h2>
            <p className="text-xs text-[#A1A1AA] mt-1 max-w-2xl leading-relaxed">
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
            className={`p-3 rounded-lg border text-xs font-mono space-y-1 ${
              githubVerifyResult.verified
                ? 'bg-[#0D1F17] border-[#164E35] text-[#34D399]'
                : 'bg-[#241215] border-[#4C1D24] text-[#F87171]'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-xs">
              {githubVerifyResult.verified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <span>GitHub Authentication Verified: {githubVerifyResult.authenticatedUser}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-[#EF4444]" />
                  <span>Verification Failed: {githubVerifyResult.reason}</span>
                </>
              )}
            </div>
            {githubVerifyResult.verified && (
              <p className="text-[11px] text-[#A1A1AA]">
                Rate limit remaining: {githubVerifyResult.rateLimitRemaining || 'N/A'} • Token scopes: [{githubVerifyResult.scopes?.join(', ') || 'none'}]
              </p>
            )}
          </div>
        )}

        {/* States Description */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1">
            <span className="text-[#FBBF24] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
              State: pending
            </span>
            <p className="text-[11px] text-[#71717A]">Sent immediately when webhook is received and jobs begin execution.</p>
          </div>

          <div className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1">
            <span className="text-[#34D399] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              State: success
            </span>
            <p className="text-[11px] text-[#71717A]">Sent when all pipeline jobs complete with zero exit codes.</p>
          </div>

          <div className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1">
            <span className="text-[#F87171] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
              State: failure
            </span>
            <p className="text-[11px] text-[#71717A]">Sent when any step fails or times out during execution.</p>
          </div>

          <div className="p-2.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1">
            <span className="text-[#A1A1AA] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#71717A]" />
              State: error
            </span>
            <p className="text-[11px] text-[#71717A]">Sent if an internal engine scheduler exception occurs.</p>
          </div>
        </div>
      </Card>

      {/* SECTION E — Getting Started Onboarding Sequence */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#3B82F6]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
            Section E — Developer Getting Started Guide
          </h2>
        </div>

        <Card variant="surface" className="p-4 rounded-xl border-[#27272A] space-y-3">
          <p className="text-xs text-[#A1A1AA] leading-relaxed">
            Verified commands from <code className="text-[#3B82F6]">package.json</code> to run this engine:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
              <span className="text-[#D4D4D8] font-semibold">1. Start Backend Engine</span>
              <code className="block p-1.5 rounded bg-[#0B0C0E] border border-[#27272A] text-[#F4F4F5] select-all">
                npm run dev
              </code>
              <span className="text-[10px] text-[#71717A] block">Express server on port 3000 with watcher</span>
            </div>

            <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
              <span className="text-[#D4D4D8] font-semibold">2. Start Dashboard</span>
              <code className="block p-1.5 rounded bg-[#0B0C0E] border border-[#27272A] text-[#F4F4F5] select-all">
                npm run dashboard:dev
              </code>
              <span className="text-[10px] text-[#71717A] block">Vite UI dev server on http://localhost:5174</span>
            </div>

            <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
              <span className="text-[#D4D4D8] font-semibold">3. Start Ngrok Tunnel</span>
              <code className="block p-1.5 rounded bg-[#0B0C0E] border border-[#27272A] text-[#F4F4F5] select-all">
                npm run tunnel
              </code>
              <span className="text-[10px] text-[#71717A] block">Exposes port 3000 publicly for GitHub webhooks</span>
            </div>
          </div>
        </Card>
      </div>

      {/* SECTION F — Recent Webhook Deliveries */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-[#3B82F6]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
            Section F — Recent Webhook Deliveries ({readiness.recentDeliveries.length})
          </h2>
        </div>

        <Card variant="surface" noPadding className="border border-[#27272A]">
          {readiness.recentDeliveries.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#71717A] font-mono">
              No webhook deliveries recorded since server startup. Push to your repository to see deliveries appear in real time.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#141519] text-[#71717A] border-b border-[#27272A]">
                  <tr>
                    <th className="py-2.5 px-3">Delivery &amp; Time</th>
                    <th className="py-2.5 px-3">Workflow / Event</th>
                    <th className="py-2.5 px-3">Repository &amp; Commit</th>
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3">Validation Outcome</th>
                    <th className="py-2.5 px-3">Pipeline Run</th>
                    <th className="py-2.5 px-3 text-right">GitHub Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2026]">
                  {readiness.recentDeliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-[#16181F] text-[#D4D4D8] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="text-[#3B82F6] font-semibold truncate max-w-[130px]" title={del.id}>
                          {del.id}
                        </div>
                        <div className="text-[10px] text-[#71717A] mt-0.5">
                          {new Date(del.timestamp).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#F4F4F5]">{del.workflowName}</div>
                        <div className="text-[10px] text-[#71717A] uppercase">{del.event}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-[#D4D4D8]">{del.repository}</div>
                        <div className="flex items-center gap-1 text-[11px] text-[#71717A] mt-0.5">
                          <span>{del.commitSha.slice(0, 7)}</span>
                          {del.repository && (
                            <a
                              href={`https://github.com/${del.repository}/commit/${del.commitSha}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#3B82F6] hover:text-[#60A5FA]"
                              title="Open commit on GitHub"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-[#141519] border border-[#27272A] text-[#D4D4D8]">
                          {del.branch}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 max-w-[220px]">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            del.status === 'accepted'
                              ? 'bg-[#0D1F17] text-[#34D399] border-[#164E35]'
                              : del.status === 'skipped'
                              ? 'bg-[#241A0E] text-[#FBBF24] border-[#4C3415]'
                              : 'bg-[#241215] text-[#F87171] border-[#4C1D24]'
                          }`}
                        >
                          {del.validationOutcome || del.status.toUpperCase()}
                        </span>
                        {del.outcomeReason && (
                          <div className="text-[10px] text-[#71717A] mt-1 truncate" title={del.outcomeReason}>
                            {del.outcomeReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {del.runId ? (
                          <button
                            onClick={() => navigate(`/runs/${del.runId}`)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#16181D] hover:bg-[#20222A] text-[#3B82F6] hover:text-[#60A5FA] border border-[#27272A] font-medium text-xs transition-colors"
                            title={`Jump to run ${del.runId}`}
                          >
                            <span>{del.runId.slice(0, 8)}...</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-[#52525B] text-xs italic">No run</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {del.commitStatus ? (
                          <div>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                del.commitStatus.state === 'success'
                                  ? 'bg-[#0D1F17] text-[#34D399] border-[#164E35]'
                                  : del.commitStatus.state === 'pending'
                                  ? 'bg-[#0E1B2E] text-[#60A5FA] border-[#1D3557]'
                                  : del.commitStatus.state === 'failure'
                                  ? 'bg-[#241215] text-[#F87171] border-[#4C1D24]'
                                  : 'bg-[#18191E] text-[#A1A1AA] border-[#27272A]'
                              }`}
                              title={del.commitStatus.description}
                            >
                              {del.commitStatus.state.toUpperCase()}
                            </span>
                            <div className="text-[9px] text-[#71717A] mt-0.5">{del.commitStatus.context}</div>
                          </div>
                        ) : (
                          <span className="text-[#52525B] text-[10px]">Unavailable</span>
                        )}
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
