import React from 'react';
import { Layers } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-[#27272A] bg-[#111317] ${className}`}
    >
      <div className="w-10 h-10 rounded-lg bg-[#181A20] border border-[#27272A] flex items-center justify-center text-[#A1A1AA] mb-3.5">
        {icon || <Layers className="w-5 h-5 text-[#3B82F6]" />}
      </div>
      <h3 className="text-sm font-semibold text-[#F4F4F5] mb-1">{title}</h3>
      <p className="text-xs text-[#71717A] max-w-sm mb-4 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
