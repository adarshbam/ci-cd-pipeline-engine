import React from 'react';
import { GitBranch } from 'lucide-react';

export interface LogoProps {
  showBadge?: boolean;
  engineSubtitle?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  showBadge = false,
  engineSubtitle = 'Platform',
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Restrained Git Branch CI Icon */}
      <div className="w-7 h-7 rounded-lg bg-[#22242B] border border-[#2F323B] flex items-center justify-center text-[#3B82F6] shrink-0">
        <GitBranch className="w-4 h-4 text-[#3B82F6]" />
      </div>

      {/* Brand Title */}
      <div className="flex flex-col">
        <span className="font-semibold text-sm tracking-tight text-[#F4F4F5] leading-snug">
          GitHub CI/CD <span className="text-[#3B82F6] font-medium">Engine</span>
        </span>
        {showBadge && (
          <span className="text-[10px] text-[#71717A] font-mono leading-none mt-0.5">
            {engineSubtitle}
          </span>
        )}
      </div>
    </div>
  );
};
