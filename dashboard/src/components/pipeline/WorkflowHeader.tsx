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
  Sparkles
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
}

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  run,
  activeTab,
  onTabChange,
  onRerun,
  onPause,
  onCancel,
  isActionLoading = false,
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
    { id: 'artifacts', label: 'Artifacts', count: 4 },
    { id: 'environments', label: 'Environments', count: 3 },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Top Breadcrumb & Action Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Back button & Title Info */}
        <div className="flex items-start gap-3.5">
          <button
            onClick={() => navigate('/workflows')}
            className="mt-1 p-1.5 rounded-xl text-slate-400 hover:text-white bg-[#0e172a] hover:bg-[#14233f] border border-[#1b2b48] transition-colors"
            title="Back to workflows"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono">
                {run.workflowName}
              </h1>

              {/* Branch Badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0e192f] border border-[#1b2c4e] text-slate-300 text-xs font-mono">
                <GitBranch className="w-3.5 h-3.5 text-sky-400" />
                <span>{run.branch}</span>
              </div>

              {/* Commit SHA Badge with copy button */}
              <div
                onClick={copyShaToClipboard}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0e192f] border border-[#1b2c4e] text-slate-300 text-xs font-mono cursor-pointer hover:border-slate-500 transition-colors"
                title="Click to copy commit SHA"
              >
                <GitCommit className="w-3.5 h-3.5 text-slate-400" />
                <span>{run.commitSha}</span>
                {copiedSha ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-500" />
                )}
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Production deployment pipeline for web application
            </p>

            {/* Meta Tags Row matching screenshot */}
            <div className="flex flex-wrap items-center gap-3 mt-2.5 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1627] border border-[#1a2744]">
                {run.trigger}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1627] border border-[#1a2744]">
                <Layers className="w-3 h-3 text-sky-400" />
                {run.totalJobs} jobs
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1627] border border-[#1a2744]">
                <Clock className="w-3 h-3 text-emerald-400" />
                {run.duration}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0d1627] border border-[#1a2744]">
                <Calendar className="w-3 h-3 text-slate-400" />
                {run.startedAt}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Workflow Dropdown & Action Buttons matching screenshot */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:self-start">
          {/* Action Buttons Group */}
          <div className="flex items-center gap-2">
            {/* Workflow selector box matching screenshot */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setShowWorkflowDropdown(!showWorkflowDropdown)}
                className="flex flex-col text-left px-3 py-1 bg-[#0b1220] hover:bg-[#111c30] border border-[#1b2b48] rounded-xl text-xs transition-colors select-none"
              >
                <span className="text-[10px] text-slate-400 leading-none mb-0.5">Workflow</span>
                <span className="font-bold text-slate-100 font-mono flex items-center gap-1.5 leading-tight">
                  {run.workflowName}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </span>
              </button>
            </div>

            {/* Rerun Button (Emerald from screenshot) */}
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

            {/* Cancel Run Button (Red Outline from screenshot) */}
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle className="w-3.5 h-3.5" />}
              onClick={onCancel}
            >
              Cancel Run
            </Button>

            <button className="p-2 rounded-xl bg-[#0e172a] hover:bg-[#14233f] border border-[#1c2b48] text-slate-400 hover:text-white transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Status Display on far right */}
          <div className="flex items-center gap-2.5 pl-2 sm:border-l border-[#1b2b48]">
            <StatusBadge status={run.status} size="sm" />
            <div className="text-right hidden sm:block">
              <span className="text-[11px] text-slate-400 block font-mono">
                Started 10:24 AM
              </span>
              <span className="text-[10px] text-slate-500 block">
                {run.elapsedTime}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar matching screenshot */}
      <Tabs
        items={tabs}
        activeTab={activeTab}
        onChange={onTabChange}
        variant="underline"
      />
    </div>
  );
};
