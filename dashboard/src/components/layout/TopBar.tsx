import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  PanelLeft,
  Home,
  ChevronRight,
  ChevronDown,
  Search,
  Command,
  Check,
  Menu
} from 'lucide-react';
import { pipelineApi } from '../../api/client';
import { useDataMode } from '../../context/DataModeContext';
import { Workflow, EngineStatus } from '../../types';

export interface TopBarProps {
  onMenuClick?: () => void;
  onToggleCollapse?: () => void;
  selectedWorkflow?: string;
  onSelectWorkflow?: (workflowName: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onMenuClick,
  onToggleCollapse,
  selectedWorkflow = 'day7-capstone',
  onSelectWorkflow
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { dataMode, toggleDataMode, isRealMode } = useDataMode();

  const [searchQuery, setSearchQuery] = useState('');
  const [showWorkflowDropdown, setShowWorkflowDropdown] = useState(false);
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

  // Compute breadcrumbs based on active route
  const getBreadcrumbs = () => {
    const pathname = location.pathname;
    const parts = pathname.split('/').filter(Boolean);

    if (parts.length === 0 || pathname === '/dashboard') {
      return [
        { label: 'CI/CD Engine', path: '/dashboard' },
        { label: 'Dashboard', path: '/dashboard', current: true }
      ];
    }

    if (parts[0] === 'workflows') {
      if (parts.length === 1) {
        return [
          { label: 'CI/CD Engine', path: '/dashboard' },
          { label: 'Workflows', path: '/workflows', current: true }
        ];
      }
      return [
        { label: 'CI/CD Engine', path: '/dashboard' },
        { label: 'Workflows', path: '/workflows' },
        { label: parts[1], path: pathname, current: true }
      ];
    }

    if (parts[0] === 'runs') {
      if (parts.length === 1) {
        return [
          { label: 'CI/CD Engine', path: '/dashboard' },
          { label: 'Runs', path: '/runs', current: true }
        ];
      }
      return [
        { label: 'CI/CD Engine', path: '/dashboard' },
        { label: 'Runs', path: '/runs' },
        { label: `Run #${parts[1]}`, path: pathname, current: true }
      ];
    }

    // Capitalize first segment
    const title = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return [
      { label: 'CI/CD Engine', path: '/dashboard' },
      { label: title, path: pathname, current: true }
    ];
  };

  const breadcrumbs = getBreadcrumbs();

  const filteredWorkflows = workflows.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.repository.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="h-[60px] bg-[#09090B] border-b border-[#27272A] sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
      {/* Left side: Sidebar toggle -> vertical separator -> Home -> Breadcrumb Navigation */}
      <div className="flex items-center gap-2.5 min-w-0 pr-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-md text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#181A20] transition-colors"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Desktop sidebar toggle button */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex p-1.5 rounded-md text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#181A20] transition-colors"
          aria-label="Toggle sidebar collapse"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* Thin vertical separator */}
        <div className="h-4 w-px bg-[#27272A] mx-0.5 shrink-0" />

        {/* Home icon button */}
        <button
          onClick={() => navigate('/dashboard')}
          title="Home"
          className="p-1.5 rounded-md text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#181A20] transition-colors shrink-0"
        >
          <Home className="w-3.5 h-3.5" />
        </button>

        {/* Breadcrumb Hierarchy */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs min-w-0"
        >
          {breadcrumbs.map((crumb, idx) => {
            const isFirstAncestor = !crumb.current && idx === 0;
            const isIntermediate = !crumb.current && idx > 0;
            const hideChevronOnMobile =
              isFirstAncestor
                ? 'hidden md:inline'
                : isIntermediate
                ? 'hidden sm:inline'
                : '';
            const hideButtonOnMobile =
              isFirstAncestor
                ? 'hidden md:inline'
                : isIntermediate
                ? 'hidden sm:inline'
                : '';

            return (
              <React.Fragment key={crumb.label + idx}>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-[#52525B] shrink-0 ${hideChevronOnMobile}`}
                />
                {crumb.current ? (
                  <span className="font-medium text-[#F4F4F5] truncate max-w-[140px] sm:max-w-[240px]">
                    {crumb.label}
                  </span>
                ) : (
                  <button
                    onClick={() => navigate(crumb.path)}
                    className={`font-medium text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors truncate max-w-[140px] ${hideButtonOnMobile}`}
                  >
                    {crumb.label}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Right side: Compact group of operational controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Global Search */}
        <div className="relative hidden xl:block w-52">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#71717A]">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 250)}
            placeholder="Search pipelines..."
            className="w-full pl-8 pr-10 py-1 bg-[#141519] border border-[#27272A] rounded-md text-xs text-[#F4F4F5] placeholder-[#71717A] focus:outline-none focus:border-[#3B82F6] transition-colors"
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
            <kbd className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-mono text-[#71717A] bg-[#1E2026] rounded border border-[#27272A]">
              <Command className="w-2.5 h-2.5" /> K
            </kbd>
          </div>

          {searchFocused && (
            <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-[#141519] border border-[#27272A] rounded-lg shadow-xl z-50 text-xs max-h-60 overflow-y-auto">
              <div className="text-[10px] uppercase font-semibold text-[#71717A] px-2 py-1">
                Workflows ({filteredWorkflows.length})
              </div>
              {filteredWorkflows.length === 0 ? (
                <div className="px-2 py-1.5 text-[#71717A] text-xs">No matches</div>
              ) : (
                filteredWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    onMouseDown={() => navigate(`/workflows/${wf.slug}`)}
                    className="px-2 py-1 rounded hover:bg-[#1E2026] text-[#D4D4D8] cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-mono text-xs">{wf.name}</span>
                    <span className="text-[10px] text-[#71717A] font-mono truncate max-w-[90px]">
                      {wf.repository}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Real Mode vs Demo Mode Secondary Indicator */}
        <button
          onClick={toggleDataMode}
          title={`Currently in ${dataMode.toUpperCase()} MODE. Click to toggle.`}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] text-[11px] font-mono text-[#D4D4D8] transition-colors"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isRealMode ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
            }`}
          />
          <span className="uppercase font-semibold tracking-wider text-[10px]">
            {isRealMode ? 'REAL MODE' : 'DEMO MODE'}
          </span>
        </button>

        {/* Workspace / Workflow Selector Dropdown */}
        <div className="relative hidden md:block">
          <button
            onClick={() => setShowWorkflowDropdown(!showWorkflowDropdown)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] rounded-md text-xs font-medium text-[#D4D4D8] transition-colors"
          >
            <span className="text-[#71717A] text-[11px]">Workflow:</span>
            <span className="font-mono text-xs text-[#F4F4F5] truncate max-w-[130px]">
              {selectedWorkflow}
            </span>
            <ChevronDown className="w-3 h-3 text-[#71717A]" />
          </button>

          {showWorkflowDropdown && (
            <div className="absolute right-0 mt-1 w-60 p-1 bg-[#141519] border border-[#27272A] rounded-lg shadow-2xl z-50 max-h-72 overflow-y-auto">
              <div className="text-[10px] uppercase font-semibold text-[#71717A] px-2 py-1">
                Workflows ({workflows.length})
              </div>
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => {
                    onSelectWorkflow?.(wf.name);
                    setShowWorkflowDropdown(false);
                    navigate(`/workflows/${wf.slug}`);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                    wf.name === selectedWorkflow
                      ? 'bg-[#22242B] text-[#F4F4F5] font-semibold'
                      : 'text-[#A1A1AA] hover:bg-[#1E2026] hover:text-[#F4F4F5]'
                  }`}
                >
                  <span className="font-mono truncate">{wf.name}</span>
                  {wf.name === selectedWorkflow && <Check className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Engine Operational Status: Small green dot and readable text */}
        <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#16181D] border border-[#27272A] text-xs text-[#D4D4D8]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              engineStatus.status === 'online' ? 'bg-[#10B981]' : 'bg-[#EF4444]'
            }`}
          />
          <span className="text-[11px] text-[#A1A1AA]">
            {engineStatus.status === 'online'
              ? `Engine Online :${engineStatus.port || '3000'}`
              : 'Engine Offline'}
          </span>
        </div>

        {/* GitHub Monochrome Icon Button */}
        <button
          onClick={() => navigate('/integrations')}
          title="GitHub Integration Setup"
          className="w-7 h-7 rounded-md bg-[#16181D] hover:bg-[#20222A] border border-[#27272A] flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </button>

        {/* User Identity Avatar */}
        <div className="w-7 h-7 rounded-md bg-[#22242B] border border-[#2F323B] flex items-center justify-center text-xs font-medium text-[#F4F4F5]">
          JD
        </div>
      </div>
    </header>
  );
};
