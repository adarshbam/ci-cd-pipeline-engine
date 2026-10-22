import React from 'react';
import {
  Wrench,
  FlaskConical,
  Code2,
  Box,
  CloudUpload,
  Activity,
  RotateCcw,
  Check,
  Loader2,
  Clock,
  GitBranch,
  Terminal
} from 'lucide-react';
import { JobIconType, JobStatus } from '../../types';

export interface JobChipProps {
  iconType: JobIconType;
  name: string;
  duration?: string;
  status: JobStatus;
  progress?: number;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const renderJobIcon = (iconType: JobIconType, className = 'w-4 h-4') => {
  switch (iconType) {
    case 'webhook':
      return <GitBranch className={className} />;
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

export const JobChip: React.FC<JobChipProps> = ({
  iconType,
  name,
  duration,
  status,
  isSelected = false,
  onClick,
  className = ''
}) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'success':
        return {
          wrapper: 'bg-[#0d1f1c]/90 border-emerald-500/70 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:border-emerald-400',
          iconBg: 'text-emerald-400',
          badge: <Check className="w-3.5 h-3.5 text-emerald-400" />
        };
      case 'running':
        return {
          wrapper: 'bg-[#0b1b36]/90 border-sky-400 text-sky-200 shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:border-sky-300 ring-2 ring-sky-400/30',
          iconBg: 'text-sky-400',
          badge: <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
        };
      case 'failed':
        return {
          wrapper: 'bg-[#2a131b]/90 border-red-500/80 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.25)] hover:border-red-400',
          iconBg: 'text-red-400',
          badge: <span className="text-red-400 font-bold text-xs">✕</span>
        };
      case 'skipped':
        return {
          wrapper: 'bg-[#101726]/80 border-slate-700/60 text-slate-400 hover:border-slate-600',
          iconBg: 'text-slate-500',
          badge: <RotateCcw className="w-3 h-3 text-slate-500" />
        };
      case 'queued':
      default:
        return {
          wrapper: 'bg-[#101726]/80 border-slate-700/60 text-slate-300 hover:border-slate-500',
          iconBg: 'text-slate-400',
          badge: <Clock className="w-3.5 h-3.5 text-slate-400" />
        };
    }
  };

  const current = getStatusStyles();

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border backdrop-blur-md cursor-pointer transition-all duration-150 ${current.wrapper} ${isSelected ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-[#070b14]' : ''} ${className}`}
    >
      <span className={`shrink-0 ${current.iconBg}`}>
        {renderJobIcon(iconType, 'w-4 h-4')}
      </span>
      <div className="flex flex-col text-left">
        <span className="text-xs font-semibold tracking-wide text-slate-100">{name}</span>
        {duration && <span className="text-[10px] text-slate-400">{duration}</span>}
      </div>
      <div className="ml-1 shrink-0">
        {current.badge}
      </div>
    </div>
  );
};
