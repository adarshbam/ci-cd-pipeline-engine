import React from 'react';
import { ChevronRight, CheckCircle2, TrendingDown, BarChart3, Radio } from 'lucide-react';
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
    <div className="rounded-2xl bg-[#090f1e] border border-[#192742] overflow-hidden shadow-xl p-5 flex flex-col justify-between">
      {/* Header */}
      <div
        onClick={onViewAll}
        className="flex items-center justify-between cursor-pointer group mb-4"
      >
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 group-hover:text-sky-400 transition-colors">
          Run Summary
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
        </h3>
      </div>

      {/* 2x2 Stat Cards Grid matching screenshot */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {/* Stat 1: Active Run */}
        <div className="p-3.5 rounded-xl bg-[#0d1629] border border-[#1b2b48] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Active Run</span>
            <span className="text-xl font-bold text-slate-100 mt-0.5 block">{metrics.activeRuns}</span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">in progress</span>
          </div>
          {/* Progress Ring */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <svg className="w-8 h-8 transform -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="12"
                stroke="#1e293b"
                strokeWidth="3"
                fill="none"
              />
              <circle
                cx="16"
                cy="16"
                r="12"
                stroke="#38bdf8"
                strokeWidth="3"
                strokeDasharray="75"
                strokeDashoffset="25"
                strokeLinecap="round"
                fill="none"
                className="drop-shadow-[0_0_4px_rgba(56,189,248,0.8)]"
              />
            </svg>
          </div>
        </div>

        {/* Stat 2: Success Rate */}
        <div className="p-3.5 rounded-xl bg-[#0d1629] border border-[#1b2b48] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Success Rate</span>
            <span className="text-xl font-bold text-slate-100 mt-0.5 block">{metrics.successRate}%</span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">Last 50 runs</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Stat 3: Avg Duration */}
        <div className="p-3.5 rounded-xl bg-[#0d1629] border border-[#1b2b48] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Avg Duration</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-base font-bold text-slate-100 font-mono">{metrics.avgDuration}</span>
              <span className="text-[10px] font-semibold text-emerald-400 flex items-center">
                ↓ 12%
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5 block">vs. previous 50</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-sky-950/60 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <TrendingDown className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* Stat 4: Total Runs */}
        <div className="p-3.5 rounded-xl bg-[#0d1629] border border-[#1b2b48] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Total Runs</span>
            <span className="text-xl font-bold text-slate-100 mt-0.5 block">{metrics.totalRuns30Days}</span>
            <span className="text-[10px] text-slate-500 mt-0.5 block">Last 30 days</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-950/60 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <BarChart3 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Environments Section */}
      <div className="border-t border-[#16233b] pt-3.5">
        <span className="text-xs font-semibold text-slate-300 block mb-2.5">
          Environments
        </span>
        <div className="space-y-2">
          {environments.map((env) => {
            const isDeploying = env.status === 'deploying';
            return (
              <div
                key={env.id}
                className="flex items-center justify-between text-xs py-1"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      env.name === 'Production'
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                        : env.name === 'Staging'
                        ? 'bg-sky-400'
                        : 'bg-slate-400'
                    } ${isDeploying ? 'animate-pulse' : ''}`}
                  />
                  <span className="text-slate-200 font-medium">{env.name}</span>
                </div>
                <span
                  className={`font-mono text-[11px] ${
                    isDeploying
                      ? 'text-sky-400 animate-pulse'
                      : 'text-slate-500'
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
