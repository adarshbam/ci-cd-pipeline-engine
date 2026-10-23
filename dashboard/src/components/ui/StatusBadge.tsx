import React from 'react';
import { Check, Clock, AlertCircle, RotateCcw, Loader2, Ban } from 'lucide-react';
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
          textClass: 'text-[#34D399]',
          bgClass: 'bg-[#0D1F17] border-[#164E35]',
          dotClass: 'bg-[#10B981]',
          icon: <Check className="w-3 h-3 text-[#34D399] stroke-[2.5]" />
        };
      case 'running':
      case 'deploying':
        return {
          label: customLabel || (status === 'deploying' ? 'Deploying...' : 'Running'),
          textClass: 'text-[#60A5FA]',
          bgClass: 'bg-[#0E1B2E] border-[#1D3557]',
          dotClass: 'bg-[#3B82F6]',
          icon: <Loader2 className="w-3 h-3 text-[#60A5FA] animate-spin" />
        };
      case 'queued':
        return {
          label: customLabel || 'Queued',
          textClass: 'text-[#A1A1AA]',
          bgClass: 'bg-[#18191E] border-[#27272A]',
          dotClass: 'bg-[#71717A]',
          icon: <Clock className="w-3 h-3 text-[#A1A1AA]" />
        };
      case 'error':
      case 'failed':
        return {
          label: customLabel || 'Failed',
          textClass: 'text-[#F87171]',
          bgClass: 'bg-[#241215] border-[#4C1D24]',
          dotClass: 'bg-[#EF4444]',
          icon: <AlertCircle className="w-3 h-3 text-[#F87171]" />
        };
      case 'cancelled':
        return {
          label: customLabel || 'Cancelled',
          textClass: 'text-[#FBBF24]',
          bgClass: 'bg-[#241A0E] border-[#4C3415]',
          dotClass: 'bg-[#F59E0B]',
          icon: <Ban className="w-3 h-3 text-[#FBBF24]" />
        };
      case 'skipped':
        return {
          label: customLabel || 'Skipped',
          textClass: 'text-[#71717A]',
          bgClass: 'bg-[#18191E] border-[#27272A]',
          dotClass: 'bg-[#52525B]',
          icon: <RotateCcw className="w-3 h-3 text-[#71717A]" />
        };
      case 'online':
        return {
          label: customLabel || 'Server Online',
          textClass: 'text-[#34D399]',
          bgClass: 'bg-[#0D1F17] border-[#164E35]',
          dotClass: 'bg-[#10B981]',
          icon: null
        };
      case 'idle':
        return {
          label: customLabel || 'Idle',
          textClass: 'text-[#71717A]',
          bgClass: 'bg-[#18191E] border-[#27272A]',
          dotClass: 'bg-[#52525B]',
          icon: null
        };
      case 'warning':
        return {
          label: customLabel || 'Warning',
          textClass: 'text-[#FBBF24]',
          bgClass: 'bg-[#241A0E] border-[#4C3415]',
          dotClass: 'bg-[#F59E0B]',
          icon: <AlertCircle className="w-3 h-3 text-[#FBBF24]" />
        };
      default:
        return {
          label: customLabel || status,
          textClass: 'text-[#D4D4D8]',
          bgClass: 'bg-[#18191E] border-[#27272A]',
          dotClass: 'bg-[#71717A]',
          icon: null
        };
    }
  };

  const config = getStatusConfig();

  const sizeClasses = {
    xs: 'text-[11px] px-1.5 py-0.5 gap-1.5 rounded',
    sm: 'text-xs px-2 py-0.5 gap-1.5 rounded-md',
    md: 'text-xs px-2.5 py-1 gap-2 rounded-md',
    lg: 'text-sm px-3 py-1.5 gap-2 rounded-lg',
  }[size];

  if (variant === 'dot-only') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.textClass} ${className}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
        {config.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-medium border select-none ${config.bgClass} ${config.textClass} ${sizeClasses} ${className}`}
    >
      {showIcon && config.icon ? (
        config.icon
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      )}
      <span className="leading-none">{config.label}</span>
    </span>
  );
};
