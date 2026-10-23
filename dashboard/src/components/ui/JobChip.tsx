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

export const renderJobIcon = (iconType: JobIconType, className = 'w-3.5 h-3.5') => {
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
          wrapper: 'bg-[#0D1F17] border-[#164E35] text-[#34D399] hover:border-[#1F6E4C]',
          iconBg: 'text-[#34D399]',
          badge: <Check className="w-3 h-3 text-[#34D399] stroke-[2.5]" />
        };
      case 'running':
        return {
          wrapper: 'bg-[#0E1B2E] border-[#1D3557] text-[#60A5FA] hover:border-[#2C4E7F]',
          iconBg: 'text-[#60A5FA]',
          badge: <Loader2 className="w-3 h-3 text-[#60A5FA] animate-spin" />
        };
      case 'failed':
        return {
          wrapper: 'bg-[#241215] border-[#4C1D24] text-[#F87171] hover:border-[#6B2228]',
          iconBg: 'text-[#F87171]',
          badge: <span className="text-[#F87171] font-bold text-xs">✕</span>
        };
      case 'skipped':
        return {
          wrapper: 'bg-[#141519] border-[#27272A] text-[#71717A] hover:border-[#383B46]',
          iconBg: 'text-[#71717A]',
          badge: <RotateCcw className="w-3 h-3 text-[#71717A]" />
        };
      case 'queued':
      default:
        return {
          wrapper: 'bg-[#141519] border-[#27272A] text-[#A1A1AA] hover:border-[#383B46]',
          iconBg: 'text-[#71717A]',
          badge: <Clock className="w-3 h-3 text-[#71717A]" />
        };
    }
  };

  const current = getStatusStyles();

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${current.wrapper} ${isSelected ? 'ring-1 ring-[#3B82F6]' : ''} ${className}`}
    >
      <span className={`shrink-0 ${current.iconBg}`}>
        {renderJobIcon(iconType, 'w-3.5 h-3.5')}
      </span>
      <div className="flex flex-col text-left">
        <span className="text-xs font-semibold text-[#F4F4F5] font-mono">{name}</span>
        {duration && <span className="text-[10px] text-[#71717A] font-mono">{duration}</span>}
      </div>
      <div className="ml-1 shrink-0">
        {current.badge}
      </div>
    </div>
  );
};
