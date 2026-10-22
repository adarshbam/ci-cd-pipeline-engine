import React, { useState } from 'react';
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
  Maximize2,
  Minus,
  Plus,
  GitBranch,
  Layers,
  ListFilter
} from 'lucide-react';
import { Job, JobStatus } from '../../types';

export interface PipelineGraphProps {
  jobs: Job[];
  onSelectJob: (job: Job) => void;
  selectedJobId?: string;
  viewMode?: 'graph' | 'list';
  onToggleViewMode?: (mode: 'graph' | 'list') => void;
}

export const PipelineGraph: React.FC<PipelineGraphProps> = ({
  jobs,
  onSelectJob,
  selectedJobId,
  viewMode = 'graph',
  onToggleViewMode
}) => {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Helper to find job by name/type
  const getJobByName = (name: string) => jobs.find((j) => j.name.toLowerCase() === name.toLowerCase());

  const buildJob = getJobByName('build') || jobs[0];
  const testJob = getJobByName('test') || jobs[1];
  const lintJob = getJobByName('lint') || jobs[2];
  const packageJob = getJobByName('package') || jobs[3];
  const deployJob = getJobByName('deploy') || jobs[4];
  const healthCheckJob = getJobByName('health check') || jobs[5];
  const rollbackJob = getJobByName('rollback') || jobs[6];

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(140, Math.max(70, prev + delta)));
  };

  return (
    <div
      className={`relative rounded-2xl bg-[#090f1e] border border-[#192742] overflow-hidden shadow-2xl transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-50 bg-[#090f1e]' : ''
      }`}
    >
      {/* Graph Toolbar Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#17243c] bg-[#0b1325]/70">
        {/* Graph vs List Toggle */}
        <div className="flex items-center gap-1 bg-[#070b14] p-1 rounded-xl border border-[#1a2742]">
          <button
            onClick={() => onToggleViewMode?.('graph')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none ${
              viewMode === 'graph'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Graph
          </button>
          <button
            onClick={() => onToggleViewMode?.('list')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none ${
              viewMode === 'list'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_12px_rgba(14,165,233,0.3)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            List
          </button>
        </div>

        {/* Zoom & Fullscreen Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#070b14] rounded-xl border border-[#1a2742] p-1 text-slate-400">
            <button
              onClick={() => handleZoom(-10)}
              className="p-1 hover:text-white hover:bg-slate-800 rounded"
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono font-medium text-slate-300 min-w-12 text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => handleZoom(10)}
              className="p-1 hover:text-white hover:bg-slate-800 rounded"
              title="Zoom In"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-xl bg-[#070b14] border border-[#1a2742] text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Visualizer Area */}
      <div className="relative w-full overflow-x-auto min-h-[380px] p-6 lg:p-8 flex items-center justify-center bg-grid-pattern">
        {/* Subtle radial glow under center node */}
        <div className="absolute inset-0 bg-radial-glow pointer-events-none" />

        <div
          className="relative transition-transform duration-200"
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
        >
          {/* SVG Connection Lines Layer */}
          <svg
            className="absolute top-0 left-0 w-[1050px] h-[320px] pointer-events-none z-0"
            viewBox="0 0 1050 320"
            fill="none"
          >
            <defs>
              <linearGradient id="line-gradient-success" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="line-gradient-running" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
                <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="line-gradient-queued" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#334155" stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id="line-gradient-gray" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#334155" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#1e293b" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {/* 1. Webhook to Build */}
            <path
              d="M 135 160 L 195 160"
              stroke="url(#line-gradient-success)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* 2. Build to Test (top branch) */}
            <path
              d="M 300 160 C 330 160, 335 90, 370 90"
              stroke="url(#line-gradient-success)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* 3. Build to Lint (bottom branch) */}
            <path
              d="M 300 160 C 330 160, 335 230, 370 230"
              stroke="url(#line-gradient-success)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* 4. Test to Package */}
            <path
              d="M 480 90 C 515 90, 520 160, 550 160"
              stroke="url(#line-gradient-running)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* 5. Lint to Package */}
            <path
              d="M 480 230 C 515 230, 520 160, 550 160"
              stroke="url(#line-gradient-running)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* 6. Package to Deploy */}
            <path
              d="M 670 160 L 730 160"
              stroke="url(#line-gradient-queued)"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />

            {/* 7. Deploy to Health Check (top branch) */}
            <path
              d="M 835 160 C 865 160, 870 90, 900 90"
              stroke="url(#line-gradient-gray)"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />

            {/* 8. Deploy to Rollback (bottom branch) */}
            <path
              d="M 835 160 C 865 160, 870 230, 900 230"
              stroke="url(#line-gradient-gray)"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          </svg>

          {/* Interactive DAG Nodes Layout matching the exact positions */}
          <div className="relative z-10 w-[1050px] h-[320px]">
            {/* NODE 1: Webhook Trigger (Leftmost Capsule) */}
            <div
              className="absolute left-0 top-[125px] w-[135px] h-[70px] rounded-2xl bg-[#0c1628]/95 border border-[#1e2f4f] p-2.5 flex items-center gap-3 shadow-lg select-none hover:border-slate-500 transition-all cursor-pointer"
              onClick={() => onSelectJob(buildJob)}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-100">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <div className="flex flex-col overflow-hidden text-left">
                <span className="text-xs font-bold text-slate-100">Webhook</span>
                <span className="text-[10px] text-slate-400 truncate">push to main</span>
                <span className="text-[9px] text-slate-400 font-mono">10:24 AM</span>
              </div>
            </div>

            {/* NODE 2: build (Green Success Node) */}
            <div
              onClick={() => onSelectJob(buildJob)}
              className={`absolute left-[195px] top-[125px] w-[105px] h-[70px] rounded-2xl bg-[#0a1e1b]/90 border border-emerald-500/80 p-2.5 flex items-center justify-between shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 transition-all cursor-pointer ${
                selectedJobId === buildJob.id ? 'ring-2 ring-emerald-400' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-950/60 flex items-center justify-center text-emerald-400 shrink-0">
                <Wrench className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-slate-100">{buildJob.name}</span>
                <span className="text-[10px] text-slate-400">{buildJob.duration}</span>
              </div>
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* NODE 3: test (Top Branch Green Success Node) */}
            <div
              onClick={() => onSelectJob(testJob)}
              className={`absolute left-[370px] top-[55px] w-[110px] h-[70px] rounded-2xl bg-[#0a1e1b]/90 border border-emerald-500/80 p-2.5 flex items-center justify-between shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 transition-all cursor-pointer ${
                selectedJobId === testJob.id ? 'ring-2 ring-emerald-400' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-950/60 flex items-center justify-center text-emerald-400 shrink-0">
                <FlaskConical className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-slate-100">{testJob.name}</span>
                <span className="text-[10px] text-slate-400">{testJob.duration}</span>
              </div>
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* NODE 4: lint (Bottom Branch Green Success Node) */}
            <div
              onClick={() => onSelectJob(lintJob)}
              className={`absolute left-[370px] top-[195px] w-[110px] h-[70px] rounded-2xl bg-[#0a1e1b]/90 border border-emerald-500/80 p-2.5 flex items-center justify-between shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 transition-all cursor-pointer ${
                selectedJobId === lintJob.id ? 'ring-2 ring-emerald-400' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-950/60 flex items-center justify-center text-emerald-400 shrink-0">
                <Code2 className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-slate-100">{lintJob.name}</span>
                <span className="text-[10px] text-slate-400">{lintJob.duration}</span>
              </div>
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </div>

            {/* NODE 5: package (Center Highlight: Neon Blue Glowing Active Node) */}
            <div
              onClick={() => onSelectJob(packageJob)}
              className={`absolute left-[550px] top-[115px] w-[120px] h-[90px] rounded-2xl bg-[#0c1c38] border-2 border-sky-400 p-2.5 flex flex-col justify-between shadow-[0_0_30px_rgba(56,189,248,0.5)] ring-2 ring-sky-500/30 hover:scale-105 transition-all cursor-pointer ${
                selectedJobId === packageJob.id ? 'ring-4 ring-sky-300' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-sky-950/80 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 shadow-[0_0_10px_rgba(56,189,248,0.5)]">
                  <Box className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left mr-auto ml-2">
                  <span className="text-xs font-bold text-slate-100">{packageJob.name}</span>
                  <span className="text-[10px] text-slate-400">{packageJob.duration}</span>
                </div>
                <div className="w-5 h-5 flex items-center justify-center text-sky-400 shrink-0">
                  <div className="w-4 h-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                </div>
              </div>

              {/* Progress bar inside package node matching screenshot */}
              <div className="w-full mt-1">
                <div className="flex items-center justify-between text-[9px] text-sky-300 font-medium mb-1">
                  <span>Running...</span>
                  <span className="font-mono">60%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                    style={{ width: '60%' }}
                  />
                </div>
              </div>
            </div>

            {/* NODE 6: deploy (Queued Slate Node) */}
            <div className="absolute left-[730px] top-[125px] flex flex-col items-center">
              <div
                onClick={() => onSelectJob(deployJob)}
                className={`w-[105px] h-[70px] rounded-2xl bg-[#0e1628]/90 border border-slate-700/70 p-2.5 flex items-center justify-between shadow-md hover:border-slate-500 transition-all cursor-pointer ${
                  selectedJobId === deployJob.id ? 'ring-2 ring-slate-400' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 shrink-0">
                  <CloudUpload className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-slate-200">{deployJob.name}</span>
                  <span className="text-[10px] text-slate-400">{deployJob.duration}</span>
                </div>
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <span className="mt-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-800/70 text-slate-400 border border-slate-700/50">
                Queued
              </span>
            </div>

            {/* NODE 7: health check (Top Branch Queued Node) */}
            <div className="absolute left-[900px] top-[55px] flex flex-col items-center">
              <div
                onClick={() => onSelectJob(healthCheckJob)}
                className={`w-[125px] h-[70px] rounded-2xl bg-[#0e1628]/90 border border-slate-700/70 p-2.5 flex items-center justify-between shadow-md hover:border-slate-500 transition-all cursor-pointer ${
                  selectedJobId === healthCheckJob.id ? 'ring-2 ring-slate-400' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-slate-200">{healthCheckJob.name}</span>
                  <span className="text-[10px] text-slate-400">{healthCheckJob.duration}</span>
                </div>
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <span className="mt-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-800/70 text-slate-400 border border-slate-700/50">
                Queued
              </span>
            </div>

            {/* NODE 8: rollback (Bottom Branch Skipped Node) */}
            <div className="absolute left-[900px] top-[195px] flex flex-col items-center">
              <div
                onClick={() => onSelectJob(rollbackJob)}
                className={`w-[125px] h-[70px] rounded-2xl bg-[#0e1628]/60 border border-slate-800 p-2.5 flex items-center justify-between shadow-md opacity-80 hover:opacity-100 transition-all cursor-pointer ${
                  selectedJobId === rollbackJob.id ? 'ring-2 ring-slate-400' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-500 shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-slate-400">{rollbackJob.name}</span>
                  <span className="text-[10px] text-slate-400">{rollbackJob.duration}</span>
                </div>
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <span className="mt-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-slate-900/80 text-slate-400 border border-slate-800">
                Skipped
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Graph Legend & Status Footer Bar */}
      <div className="px-5 py-3 border-t border-[#162238] bg-[#0b1325]/70 flex flex-wrap items-center justify-between gap-4 text-xs select-none">
        {/* Status Legend Pills */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
            <span>Success</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.9)] animate-pulse" />
            <span>Running</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Queued</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
            <span>Failed</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            <span>Skipped</span>
          </div>
        </div>

        {/* Auto-refresh indicator */}
        <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Auto-refreshing...</span>
        </div>
      </div>
    </div>
  );
};
