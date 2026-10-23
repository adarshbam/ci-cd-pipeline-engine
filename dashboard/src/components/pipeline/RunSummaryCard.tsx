import React from 'react';
import { ChevronRight, CheckCircle2, TrendingDown, BarChart3 } from 'lucide-react';
import { Metrics, Environment } from '../../types';

export interface RunSummaryCardProps {
  metrics: Metrics;
  environments: Environment[];
  onViewAll?: () => void;
}

export const RunSummaryCard: React.FC<RunSummaryCardProps> = ({
  metrics,
  environments,
  onViewAll,
}) => {
  return (
    <div className="rounded-xl bg-[#111317] border border-[#27272A] p-4 flex flex-col justify-between">
      {/* Header */}
      <div
        onClick={onViewAll}
        className="flex items-center justify-between cursor-pointer group mb-3.5"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-1 group-hover:text-[#F4F4F5] transition-colors">
          Run Summary
          <ChevronRight className="w-3.5 h-3.5 text-[#71717A] group-hover:translate-x-0.5 transition-transform" />
        </h3>
      </div>

      {/* 2x2 Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {/* Stat 1: Active Run */}
        <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-[#A1A1AA] block">Active Run</span>
            <span className="text-lg font-bold text-[#F4F4F5] font-mono mt-0.5 block">{metrics.activeRuns}</span>
            <span className="text-[10px] text-[#71717A] mt-0.5 block">in progress</span>
          </div>
          {/* Progress Ring */}
          <div className="relative w-7 h-7 flex items-center justify-center">
            <svg className="w-7 h-7 transform -rotate-90">
              <circle
                cx="14"
                cy="14"
                r="10"
                stroke="#27272A"
                strokeWidth="2.5"
                fill="none"
              />
              <circle
                cx="14"
                cy="14"
                r="10"
                stroke="#3B82F6"
                strokeWidth="2.5"
                strokeDasharray="62"
                strokeDashoffset="20"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
        </div>

        {/* Stat 2: Success Rate */}
        <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-[#A1A1AA] block">Success Rate</span>
            <span className="text-lg font-bold text-[#F4F4F5] font-mono mt-0.5 block">{metrics.successRate}%</span>
            <span className="text-[10px] text-[#71717A] mt-0.5 block">Last 50 runs</span>
          </div>
          <div className="w-7 h-7 rounded-md bg-[#0D1F17] border border-[#164E35] flex items-center justify-center text-[#34D399]">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Stat 3: Avg Duration */}
        <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-[#A1A1AA] block">Avg Duration</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-base font-bold text-[#F4F4F5] font-mono">{metrics.avgDuration}</span>
            </div>
            <span className="text-[10px] text-[#10B981] mt-0.5 block">↓ 12% vs prev</span>
          </div>
          <div className="w-7 h-7 rounded-md bg-[#16181D] border border-[#27272A] flex items-center justify-center text-[#A1A1AA]">
            <TrendingDown className="w-3.5 h-3.5 text-[#10B981]" />
          </div>
        </div>

        {/* Stat 4: Total Runs */}
        <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-[#A1A1AA] block">Total Runs</span>
            <span className="text-lg font-bold text-[#F4F4F5] font-mono mt-0.5 block">{metrics.totalRuns30Days}</span>
            <span className="text-[10px] text-[#71717A] mt-0.5 block">Last 30 days</span>
          </div>
          <div className="w-7 h-7 rounded-md bg-[#16181D] border border-[#27272A] flex items-center justify-center text-[#A1A1AA]">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Environments Section */}
      <div className="border-t border-[#27272A] pt-3">
        <span className="text-xs font-semibold text-[#A1A1AA] block mb-2">
          Target Environments
        </span>
        <div className="space-y-1.5">
          {environments.map((env) => {
            const isDeploying = env.status === 'deploying';
            return (
              <div
                key={env.id}
                className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[#141519] border border-[#22242A]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      env.name === 'Production'
                        ? 'bg-[#10B981]'
                        : env.name === 'Staging'
                        ? 'bg-[#3B82F6]'
                        : 'bg-[#71717A]'
                    }`}
                  />
                  <span className="text-[#D4D4D8] font-medium">{env.name}</span>
                </div>
                <span
                  className={`font-mono text-[11px] ${
                    isDeploying ? 'text-[#3B82F6]' : 'text-[#71717A]'
                  }`}
                >
                  {isDeploying ? 'deploying...' : 'idle'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
