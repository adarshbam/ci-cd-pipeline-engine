import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  GitBranch,
  GitCommit,
  Copy,
  Check,
  RotateCw,
  Pause,
  XCircle,
  MoreHorizontal,
  ChevronDown,
  Layers,
  Clock,
  Calendar,
  ExternalLink
} from 'lucide-react';
import { PipelineRun } from '../../types';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { Tabs } from '../ui/Tabs';

export interface WorkflowHeaderProps {
  run: PipelineRun;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onRerun: () => void;
  onPause: () => void;
  onCancel: () => void;
  isActionLoading?: boolean;
  artifactCount?: number;
}

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  run,
  activeTab,
  onTabChange,
  onRerun,
  onPause,
  onCancel,
  isActionLoading = false,
  artifactCount
}) => {
  const navigate = useNavigate();
  const [copiedSha, setCopiedSha] = useState(false);
  const [showWorkflowDropdown, setShowWorkflowDropdown] = useState(false);

  const copyShaToClipboard = () => {
    navigator.clipboard.writeText(run.commitSha);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'artifacts', label: 'Artifacts', count: artifactCount !== undefined ? artifactCount : 4 },
    { id: 'environments', label: 'Environments', count: 3 },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Top Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Back button & Title Info */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/workflows')}
            className="mt-1 p-1.5 rounded-md text-[#A1A1AA] hover:text-[#F4F4F5] bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] transition-colors"
            title="Back to workflows"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#F4F4F5] font-mono">
                {run.workflowName}
              </h1>

              {/* Branch Badge */}
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#16181D] border border-[#27272A] text-[#D4D4D8] text-xs font-mono">
                <GitBranch className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>{run.branch}</span>
              </div>

              {/* Commit SHA Badge */}
              <div
                onClick={copyShaToClipboard}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#16181D] border border-[#27272A] text-[#A1A1AA] hover:text-[#F4F4F5] hover:border-[#383B46] text-xs font-mono cursor-pointer transition-colors"
                title="Click to copy commit SHA"
              >
                <GitCommit className="w-3.5 h-3.5 text-[#71717A]" />
                <span>{run.commitSha}</span>
                {copiedSha ? (
                  <Check className="w-3 h-3 text-[#10B981]" />
                ) : (
                  <Copy className="w-3 h-3 text-[#71717A]" />
                )}
              </div>

              {/* GitHub Commit Status Badge */}
              {run.commitStatus ? (
                <div
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono border ${
                    run.commitStatus.state === 'success'
                      ? 'bg-[#0D1F17] text-[#34D399] border-[#164E35]'
                      : run.commitStatus.state === 'pending'
                      ? 'bg-[#0E1B2E] text-[#60A5FA] border-[#1D3557]'
                      : run.commitStatus.state === 'failure'
                      ? 'bg-[#241215] text-[#F87171] border-[#4C1D24]'
                      : 'bg-[#18191E] text-[#A1A1AA] border-[#27272A]'
                  }`}
                  title={`${run.commitStatus.context}: ${run.commitStatus.description}`}
                >
                  <span className="text-[#71717A] font-sans">GitHub:</span>
                  <span className="font-bold uppercase text-[10px]">
                    {run.commitStatus.state}
                  </span>
                  {(run.commitStatus.url || run.commitStatus.commitUrl) && (
                    <a
                      href={run.commitStatus.url || run.commitStatus.commitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-0.5 text-[#3B82F6] hover:text-[#60A5FA] flex items-center"
                      title="Open commit on GitHub"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : run.repository && run.commitSha && run.commitSha !== 'HEAD' ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#16181D] border border-[#27272A] text-[#71717A] text-xs font-mono">
                  <span>GitHub:</span>
                  <span className="text-[#A1A1AA]">custom-ci/pipeline</span>
                  <a
                    href={`https://github.com/${run.repository}/commit/${run.commitSha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-0.5 text-[#3B82F6] hover:text-[#60A5FA]"
                    title="Open on GitHub"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : null}

              {/* Run vs Preview Mode indicator */}
              {run.isIdlePreview ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#16181D] border border-[#27272A] text-[#3B82F6] text-[11px] font-mono">
                  Preview Mode
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0D1F17] border border-[#164E35] text-[#34D399] text-[11px] font-mono">
                  Run Execution
                </span>
              )}
            </div>

            <p className="text-xs text-[#A1A1AA] mt-1">
              {run.isIdlePreview
                ? 'Workflow definition topology preview. Jobs are idle until triggered.'
                : 'Execution run for web application and integration tests'}
            </p>

            {/* Meta Tags Row */}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[#71717A] font-mono">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#141519] border border-[#27272A]">
                {run.trigger}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#141519] border border-[#27272A]">
                <Layers className="w-3 h-3 text-[#3B82F6]" />
                {run.totalJobs} jobs
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#141519] border border-[#27272A]">
                <Clock className="w-3 h-3 text-[#10B981]" />
                {run.duration}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#141519] border border-[#27272A]">
                <Calendar className="w-3 h-3 text-[#71717A]" />
                {run.startedAt}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Operational Actions & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 lg:self-start flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            {/* Workflow selector */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setShowWorkflowDropdown(!showWorkflowDropdown)}
                className="flex flex-col text-left px-2.5 py-1 bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] rounded-md text-xs transition-colors select-none"
              >
                <span className="text-[10px] text-[#71717A] leading-none mb-0.5">Workflow</span>
                <span className="font-semibold text-[#F4F4F5] font-mono flex items-center gap-1 leading-tight">
                  {run.workflowName}
                  <ChevronDown className="w-3 h-3 text-[#71717A]" />
                </span>
              </button>
            </div>

            {/* Rerun Button */}
            <Button
              variant="primary"
              size="sm"
              icon={<RotateCw className="w-3.5 h-3.5" />}
              isLoading={isActionLoading}
              onClick={onRerun}
            >
              Rerun
            </Button>

            {/* Pause Button */}
            <Button
              variant="secondary"
              size="sm"
              icon={<Pause className="w-3.5 h-3.5" />}
              onClick={onPause}
            >
              Pause
            </Button>

            {/* Cancel Run Button */}
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle className="w-3.5 h-3.5" />}
              onClick={onCancel}
            >
              Cancel Run
            </Button>

            <button className="p-1.5 rounded-md bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] text-[#71717A] hover:text-[#F4F4F5] transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Status Display on far right */}
          <div className="flex items-center gap-2.5 pl-2 sm:border-l border-[#27272A]">
            <StatusBadge status={run.status} size="sm" />
            <div className="text-right hidden sm:block">
              <span className="text-[11px] text-[#A1A1AA] block font-mono">
                {run.isIdlePreview ? 'Ready to run' : run.startedAt ? `Started ${run.startedAt}` : 'Started recently'}
              </span>
              <span className="text-[10px] text-[#71717A] block">
                {run.elapsedTime}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Underline Tabs */}
      <Tabs
        items={tabs}
        activeTab={activeTab}
        onChange={onTabChange}
        variant="underline"
      />
    </div>
  );
};
