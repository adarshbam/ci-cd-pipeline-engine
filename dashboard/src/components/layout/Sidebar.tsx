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
  Server,
  Radio,
  HelpCircle,
  BookOpen
} from 'lucide-react';
import { Logo } from './Logo';
import { pipelineApi } from '../../api/client';
import { EngineStatus } from '../../types';

export interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpenMobile = false,
  onCloseMobile,
  isCollapsed = false
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
        // Retain current state
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
          className="fixed inset-0 bg-black/75 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen ${
          isCollapsed ? 'w-[70px]' : 'w-64'
        } bg-[#18181B] border-r border-[#27272A] flex flex-col justify-between z-40 transition-all duration-200 select-none ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Header / Branding */}
        <div className="overflow-y-auto flex-1">
          <div className="h-[60px] px-5 flex items-center border-b border-[#27272A]">
            <Logo engineSubtitle="v1.0.0" />
          </div>

          {/* Core Navigation Links */}
          <div className="p-3 space-y-1">
            {!isCollapsed && (
              <div className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[#71717A]">
                CI/CD Engine
              </div>
            )}
            {coreNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#24262E] text-[#F4F4F5] font-semibold'
                        : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1E2026]'
                    }`
                  }
                  title={isCollapsed ? item.name : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#3B82F6] rounded-r" />
                      )}
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-[#3B82F6]' : 'text-[#71717A]'
                        }`}
                      />
                      {!isCollapsed && <span>{item.name}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}

            {/* Extensions Section */}
            {!isCollapsed && (
              <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-[#71717A] flex items-center justify-between">
                <span>Extensions</span>
                <span className="text-[10px] text-[#71717A] font-mono">
                  Post-MVP
                </span>
              </div>
            )}
            {plannedNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#24262E] text-[#F4F4F5] font-semibold'
                        : 'text-[#71717A] hover:text-[#D4D4D8] hover:bg-[#1E2026]'
                    }`
                  }
                  title={isCollapsed ? item.name : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#3B82F6] rounded-r" />
                      )}
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 shrink-0 text-[#71717A]" />
                        {!isCollapsed && <span>{item.name}</span>}
                      </div>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Bottom Section: Engine Operational Status */}
        <div className="p-3 border-t border-[#27272A] bg-[#141519] space-y-3">
          {!isCollapsed ? (
            <>
              {/* Neutral Operational Panel */}
              <div className="rounded-lg bg-[#18191E] border border-[#27272A] p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-[#A1A1AA]" />
                    <span className="text-xs font-semibold text-[#F4F4F5]">Engine Core</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-[#34D399] bg-[#0D1F17] border border-[#164E35]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    Online
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-[#A1A1AA] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Port / Host:</span>
                    <span className="text-[#D4D4D8]">:3000 (Local)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Active Runs:</span>
                    <span className="text-[#F4F4F5] font-semibold">{engineStatus.activeRuns}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Workflows:</span>
                    <span className="text-[#D4D4D8]">{engineStatus.totalWorkflows}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A]">Version:</span>
                    <span className="text-[#71717A]">v{engineStatus.version}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#27272A] flex items-center justify-between text-[10px] font-mono text-[#71717A]">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-[#3B82F6]" /> Webhook Listener
                  </span>
                  <span className="text-[#34D399] font-medium">Ready</span>
                </div>
              </div>

              {/* Sub-footer Links */}
              <div className="flex items-center justify-between px-1 text-[11px] text-[#71717A]">
                <a
                  href="#help"
                  onClick={(e) => {
                    e.preventDefault();
                    window.open('https://github.com', '_blank');
                  }}
                  className="hover:text-[#D4D4D8] flex items-center gap-1 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" /> Help & Resources
                </a>
                <NavLink
                  to="/integrations"
                  className="hover:text-[#D4D4D8] flex items-center gap-1 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" /> Guide
                </NavLink>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" title="Engine Online :3000" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
