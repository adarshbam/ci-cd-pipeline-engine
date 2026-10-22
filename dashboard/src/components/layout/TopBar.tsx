import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  Menu,
  ChevronDown,
  Command,
  Check,
  Radio,
  Zap,
  RotateCcw
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { pipelineApi } from '../../api/client';
import { useDataMode } from '../../context/DataModeContext';
import { Workflow, EngineStatus } from '../../types';

export interface TopBarProps {
  onMenuClick?: () => void;
  selectedWorkflow?: string;
  onSelectWorkflow?: (workflowName: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onMenuClick,
  selectedWorkflow = 'deploy-main',
  onSelectWorkflow
}) => {
  const navigate = useNavigate();
  const { dataMode, toggleDataMode, isRealMode } = useDataMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [showWorkflowDropdown, setShowWorkflowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    status: 'online',
    activeRuns: 0,
    totalWorkflows: 0,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    port: '3000'
  });

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [wfs, status] = await Promise.all([
          pipelineApi.getWorkflows(dataMode),
          pipelineApi.getEngineStatus()
        ]);
        if (mounted) {
          setWorkflows(wfs);
          setEngineStatus(status);
        }
      } catch {
        // Fallback
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [dataMode]);

  // Command+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('global-search-input');
        input?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredWorkflows = workflows.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.repository.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="h-16 bg-[#080d19]/90 border-b border-[#18243c] backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
      {/* Left: Mobile Menu & Search Input */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search Bar */}
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 250)}
            placeholder="Search workflows, pipelines, runs..."
            className="w-full pl-9 pr-14 py-2 bg-[#0d1527] border border-[#1d2c47] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-all shadow-inner"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-[#162238] rounded border border-slate-700/60">
              <Command className="w-2.5 h-2.5" /> K
            </kbd>
          </div>

          {/* Quick search dropdown */}
          {searchFocused && (
            <div className="absolute top-full left-0 right-0 mt-1.5 p-2 bg-[#0c1426] border border-[#1e2f4f] rounded-xl shadow-2xl z-50 text-xs max-h-72 overflow-y-auto">
              <div className="text-[10px] uppercase font-semibold text-slate-400 px-2 py-1">
                Configured Workflows ({filteredWorkflows.length})
              </div>
              {filteredWorkflows.length === 0 ? (
                <div className="px-3 py-2 text-slate-500 text-xs">No matching workflows</div>
              ) : (
                filteredWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    onMouseDown={() => navigate(`/workflows/${wf.slug}`)}
                    className="px-2.5 py-1.5 rounded-lg hover:bg-[#14233f] text-slate-200 cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-medium font-mono text-sky-300">{wf.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                      {wf.repository}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Controls: Data Mode Switcher, Workflow Selector, Server Status, User */}
      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
        {/* Real Mode vs Demo Mode Toggle */}
        <button
          onClick={toggleDataMode}
          title={`Currently in ${dataMode.toUpperCase()} MODE. Click to toggle.`}
          className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-2 transition-all shadow-sm ${
            isRealMode
              ? 'bg-[#081a17] border-emerald-500/40 text-emerald-300 hover:border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
              : 'bg-[#1e1509] border-amber-500/40 text-amber-300 hover:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isRealMode ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="uppercase text-[11px] font-bold tracking-wider">
            {isRealMode ? 'REAL MODE' : 'DEMO MODE'}
          </span>
        </button>

        {/* Workspace / Workflow Selector Dropdown */}
        <div className="relative hidden md:block">
          <button
            onClick={() => setShowWorkflowDropdown(!showWorkflowDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#0e172a] hover:bg-[#14223d] border border-[#1e2d4a] rounded-xl text-xs font-medium text-slate-200 transition-colors shadow-sm"
          >
            <span className="text-slate-400 text-[11px]">Workflow:</span>
            <span className="font-semibold text-slate-100 font-mono truncate max-w-[120px]">
              {selectedWorkflow}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showWorkflowDropdown && (
            <div className="absolute right-0 mt-1.5 w-64 p-1.5 bg-[#0c1426] border border-[#1e2f4f] rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto">
              <div className="text-[10px] uppercase font-semibold text-slate-400 px-2.5 py-1.5">
                Loaded Workflows ({workflows.length})
              </div>
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => {
                    onSelectWorkflow?.(wf.name);
                    setShowWorkflowDropdown(false);
                    navigate(`/workflows/${wf.slug}`);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    wf.name === selectedWorkflow
                      ? 'bg-sky-500/20 text-sky-300 font-semibold'
                      : 'text-slate-300 hover:bg-[#14223d]'
                  }`}
                >
                  <span className="font-mono truncate">{wf.name}</span>
                  {wf.name === selectedWorkflow && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Server Status Pill */}
        <div className="hidden sm:flex items-center">
          <StatusBadge
            status={engineStatus.status === 'online' ? 'online' : 'failed'}
            customLabel={
              engineStatus.status === 'online'
                ? `Engine Online :${engineStatus.port || '3000'}`
                : 'Engine Offline'
            }
            size="sm"
          />
        </div>

        {/* GitHub Integration Link */}
        <button
          onClick={() => navigate('/integrations')}
          title="GitHub Integration Setup"
          className="w-8 h-8 rounded-xl bg-[#0e172a] hover:bg-[#14233f] border border-[#1e2d4a] flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-sm"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </button>
      </div>
    </header>
  );
};
