import React from 'react';
import { CheckCircle2, Clock, AlertCircle, RotateCcw, Loader2, Ban } from 'lucide-react';
import { JobStatus } from '../../types';

export interface StatusBadgeProps {
  status: JobStatus | 'idle' | 'deploying' | 'online' | 'warning' | 'error' | 'healthy';
  showIcon?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'pill' | 'subtle' | 'dot-only' | 'glow';
  customLabel?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showIcon = true,
  size = 'sm',
  variant = 'pill',
  customLabel,
  className = '',
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'healthy':
      case 'success':
        return {
          label: customLabel || 'Success',
          textClass: 'text-emerald-400',
          bgClass: 'bg-emerald-950/40 border-emerald-500/30',
          dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        };
      case 'running':
      case 'deploying':
        return {
          label: customLabel || (status === 'deploying' ? 'Deploying...' : 'Running'),
          textClass: 'text-sky-400',
          bgClass: 'bg-sky-950/40 border-sky-500/40',
          dotClass: 'bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.9)]',
          icon: <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
        };
      case 'queued':
        return {
          label: customLabel || 'Queued',
          textClass: 'text-slate-400',
          bgClass: 'bg-slate-800/50 border-slate-700/50',
          dotClass: 'bg-slate-400',
          icon: <Clock className="w-3.5 h-3.5 text-slate-400" />
        };
      case 'error':
      case 'failed':
        return {
          label: customLabel || 'Failed',
          textClass: 'text-red-400',
          bgClass: 'bg-red-950/40 border-red-500/30',
          dotClass: 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
          icon: <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        };
      case 'cancelled':
        return {
          label: customLabel || 'Cancelled',
          textClass: 'text-amber-400',
          bgClass: 'bg-amber-950/40 border-amber-600/40',
          dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
          icon: <Ban className="w-3.5 h-3.5 text-amber-400" />
        };
      case 'skipped':
        return {
          label: customLabel || 'Skipped',
          textClass: 'text-slate-500',
          bgClass: 'bg-slate-900/60 border-slate-800/80',
          dotClass: 'bg-slate-500',
          icon: <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
        };
      case 'online':
        return {
          label: customLabel || 'Server Online',
          textClass: 'text-emerald-400',
          bgClass: 'bg-[#0d1c1c]/80 border-emerald-500/30',
          dotClass: 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.9)]',
          icon: null
        };
      case 'idle':
        return {
          label: customLabel || 'Idle',
          textClass: 'text-slate-400',
          bgClass: 'bg-slate-900/50 border-slate-800',
          dotClass: 'bg-slate-400',
          icon: null
        };
      case 'warning':
        return {
          label: customLabel || 'Warning',
          textClass: 'text-amber-400',
          bgClass: 'bg-amber-950/40 border-amber-500/30',
          dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
          icon: <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
        };
      default:
        return {
          label: customLabel || status,
          textClass: 'text-slate-300',
          bgClass: 'bg-slate-800/40 border-slate-700/50',
          dotClass: 'bg-slate-400',
          icon: null
        };
    }
  };

  const config = getStatusConfig();

  const sizeClasses = {
    xs: 'text-[11px] px-2 py-0.5 gap-1.5',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2',
    lg: 'text-base px-4 py-2 gap-2.5',
  }[size];

  if (variant === 'dot-only') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.textClass} ${className}`}>
        <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
        {config.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${config.bgClass} ${config.textClass} ${sizeClasses} ${className}`}
    >
      {showIcon && config.icon ? (
        config.icon
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      )}
      <span>{config.label}</span>
    </span>
  );
};
