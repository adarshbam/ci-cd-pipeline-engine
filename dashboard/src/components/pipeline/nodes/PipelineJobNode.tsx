import React from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Wrench,
  FlaskConical,
  Code2,
  Box,
  CloudUpload,
  Activity,
  RotateCcw,
  Check,
  Clock,
  Terminal,
  Ban
} from 'lucide-react';
import { PipelineNodeData } from '../dagTypes';
import { JobIconType } from '../../../types';

export const renderNodeIcon = (iconType: JobIconType, className = 'w-4 h-4') => {
  switch (iconType) {
    case 'build':
      return <Wrench className={className} />;
    case 'test':
      return <FlaskConical className={className} />;
    case 'lint':
      return <Code2 className={className} />;
    case 'package':
      return <Box className={className} />;
    case 'deploy':
      return <CloudUpload className={className} />;
    case 'health-check':
      return <Activity className={className} />;
    case 'rollback':
      return <RotateCcw className={className} />;
    default:
      return <Terminal className={className} />;
  }
};

export const PipelineJobNode: React.FC<any> = ({ data, selected }) => {
  const job = data as PipelineNodeData;
  const isRunning = job.status === 'running';
  const isSuccess = job.status === 'success';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';
  const isQueued = job.status === 'queued';
  const isSkipped = job.status === 'skipped';

  // State-specific styling
  const getContainerStyle = () => {
    if (isRunning) {
      return 'bg-[#0a1832] border-2 border-sky-400 shadow-[0_0_25px_rgba(56,189,248,0.45)] ring-2 ring-sky-500/25';
    }
    if (isSuccess) {
      return 'bg-[#071a17] border border-emerald-500/70 shadow-[0_0_18px_rgba(16,185,129,0.22)] hover:border-emerald-400';
    }
    if (isFailed) {
      return 'bg-[#220d15] border-2 border-red-500 shadow-[0_0_22px_rgba(239,68,68,0.4)] ring-2 ring-red-500/25';
    }
    if (isCancelled) {
      return 'bg-[#181210] border border-amber-600/60 shadow-[0_0_15px_rgba(217,119,6,0.2)] hover:border-amber-500';
    }
    if (isSkipped) {
      return 'bg-[#0c1322]/70 border border-slate-800 opacity-75 hover:opacity-100';
    }
    // Queued
    return 'bg-[#0d1628] border border-slate-700/80 hover:border-slate-500 shadow-md';
  };

  const getIconContainerStyle = () => {
    if (isRunning) return 'bg-sky-950/80 border border-sky-500/40 text-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]';
    if (isSuccess) return 'bg-emerald-950/60 text-emerald-400';
    if (isFailed) return 'bg-red-950/70 border border-red-500/40 text-red-400';
    if (isCancelled) return 'bg-amber-950/70 border border-amber-600/40 text-amber-400';
    if (isSkipped) return 'bg-slate-800/50 text-slate-500';
    return 'bg-slate-800/80 text-slate-400';
  };

  const getBadgeElement = () => {
    if (isRunning) {
      return (
        <div className="w-5 h-5 flex items-center justify-center text-sky-400 shrink-0">
          <div className="w-4 h-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
        </div>
      );
    }
    if (isSuccess) {
      return (
        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
          <Check className="w-3 h-3 stroke-[3]" />
        </div>
      );
    }
    if (isFailed) {
      return (
        <div className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 font-bold text-xs shrink-0">
          ✕
        </div>
      );
    }
    if (isCancelled) {
      return (
        <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
          <Ban className="w-3 h-3 stroke-[2.5]" />
        </div>
      );
    }
    if (isSkipped) {
      return <Clock className="w-4 h-4 text-slate-500 shrink-0" />;
    }
    return <Clock className="w-4 h-4 text-slate-400 shrink-0" />;
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* Target input handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !opacity-0 !border-0"
      />

      {/* Main Node Card - Scaled for prominence */}
      <div
        className={`relative w-[190px] min-h-[78px] rounded-2xl p-3 flex flex-col justify-between transition-all duration-200 cursor-pointer select-none ${getContainerStyle()} ${
          selected ? 'ring-2 ring-sky-300 ring-offset-2 ring-offset-[#070b16]' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${getIconContainerStyle()}`}>
            {renderNodeIcon(job.iconType, 'w-4 h-4')}
          </div>

          <div className="flex flex-col text-left mr-auto min-w-0">
            <span className="text-xs font-bold text-slate-100 truncate">{job.name}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {job.duration && (
                <span className="text-[10px] text-slate-400 font-mono">{job.duration}</span>
              )}
              {job.stepCount && (
                <span className="text-[10px] text-slate-500 font-mono">
                  • {job.completedSteps || 0}/{job.stepCount} steps
                </span>
              )}
            </div>
          </div>

          {getBadgeElement()}
        </div>

        {/* Running progress bar */}
        {isRunning && (
          <div className="w-full mt-2.5">
            <div className="flex items-center justify-between text-[9px] text-sky-300 font-medium mb-1">
              <span>Executing steps...</span>
              <span className="font-mono">{job.progress || 60}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)] transition-all duration-300"
                style={{ width: `${job.progress || 60}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* State sub-badge below card */}
      {job.subBadge && (
        <span
          className={`mt-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-semibold border select-none ${
            isSkipped
              ? 'bg-slate-900/80 text-slate-500 border-slate-800'
              : isFailed
              ? 'bg-red-950/70 text-red-400 border-red-800/40'
              : isCancelled
              ? 'bg-amber-950/70 text-amber-400 border-amber-800/40'
              : 'bg-slate-800/70 text-slate-300 border-slate-700/50'
          }`}
        >
          {job.subBadge}
        </span>
      )}

      {/* Source output handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !opacity-0 !border-0"
      />
    </div>
  );
};
