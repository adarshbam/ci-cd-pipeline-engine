import React from 'react';
import { GitBranch, Network } from 'lucide-react';

export interface LogoProps {
  showBadge?: boolean;
  engineSubtitle?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  showBadge = true,
  engineSubtitle = 'CI/CD Pipeline Engine',
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Connected Nodes / Git Branch Glowing Icon */}
      <div className="relative flex items-center justify-center shrink-0">
        <div className="absolute inset-0 bg-sky-500/25 blur-md rounded-xl" />
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#10203d] to-[#0a1224] border border-sky-500/40 flex items-center justify-center text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]">
          <GitBranch className="w-5 h-5 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
        </div>
      </div>

      {/* Brand Title & Engine Badge */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm sm:text-base tracking-tight text-white flex items-center">
            GitHub CI/CD <span className="text-sky-400 ml-1 font-semibold">Engine</span>
          </span>
        </div>
        {showBadge && (
          <span className="text-[10px] font-medium tracking-wider uppercase text-sky-400/90 flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
            {engineSubtitle}
          </span>
        )}
      </div>
    </div>
  );
};
