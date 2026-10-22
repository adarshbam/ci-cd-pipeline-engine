import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  GitBranch,
  PlayCircle,
  Rocket,
  Box,
  Package,
  Lock,
  Network,
  Settings,
  Activity,
  Server,
  Radio,
  ExternalLink
} from 'lucide-react';
import { Logo } from './Logo';
import { pipelineApi } from '../../api/client';
import { EngineStatus } from '../../types';

export interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpenMobile = false,
  onCloseMobile
}) => {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    status: 'online',
    activeRuns: 0,
    totalWorkflows: 3,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await pipelineApi.getEngineStatus();
        if (mounted && res) {
          setEngineStatus(res);
        }
      } catch {
        // Keep current state
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const coreNavItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Workflows', path: '/workflows', icon: GitBranch },
    { name: 'Runs', path: '/runs', icon: PlayCircle },
    { name: 'Integrations', path: '/integrations', icon: Network },
  ];

  const plannedNavItems = [
    { name: 'Deployments', path: '/deployments', icon: Rocket },
    { name: 'Environments', path: '/environments', icon: Box },
    { name: 'Artifacts', path: '/artifacts', icon: Package },
    { name: 'Secrets', path: '/secrets', icon: Lock },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-[#090e18] border-r border-[#19263f] flex flex-col justify-between z-40 transition-transform duration-200 select-none ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Header / Logo */}
        <div className="overflow-y-auto flex-1">
          <div className="h-16 px-5 flex items-center border-b border-[#162138]">
            <Logo engineSubtitle="GitHub CI/CD Engine" />
          </div>

          {/* Core Navigation Links */}
          <div className="p-3 space-y-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
              Core Engine
            </div>
            {coreNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-[#12223a] text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.18)] font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#0d1629]/80 border border-transparent'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? 'text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.7)]'
                            : 'text-slate-400'
                        }`}
                      />
                      <span>{item.name}</span>
                    </>
                  )}
                </NavLink>
              );
            })}

            {/* Planned Extensions Section */}
            <div className="px-3 pt-4 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold flex items-center justify-between">
              <span>Extensions</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400 font-mono">
                Post-MVP
              </span>
            </div>
            {plannedNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-[#12223a] text-sky-300 border border-sky-500/30 font-semibold'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-[#0d1629]/50 border border-transparent'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                    <span>{item.name}</span>
                  </div>
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Bottom Section: Real Engine Status Card */}
        <div className="p-3.5 space-y-3 border-t border-[#162138]">
          <div className="relative overflow-hidden rounded-xl bg-[#0b1324] border border-[#1d2d4c] p-3.5 shadow-lg">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs font-semibold text-slate-200">Engine Core</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-400 font-mono">
              <div className="flex items-center justify-between">
                <span>Port / Host:</span>
                <span className="text-slate-300">:3000 (Local)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Active Runs:</span>
                <span className="text-sky-400 font-bold">{engineStatus.activeRuns}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Workflows:</span>
                <span className="text-slate-300">{engineStatus.totalWorkflows}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Version:</span>
                <span className="text-slate-400">v{engineStatus.version}</span>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-[#18263f] flex items-center justify-between text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <Radio className="w-3 h-3 text-sky-400" /> Webhook Listener
              </span>
              <span className="text-emerald-400 font-medium">Ready</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
