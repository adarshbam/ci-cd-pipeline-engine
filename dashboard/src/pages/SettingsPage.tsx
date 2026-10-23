import React from 'react';
import { Server, Terminal, Cpu } from 'lucide-react';
import { Card } from '../components/ui/Card';

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5] font-mono">
            Engine Configuration &amp; Settings
          </h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#18191E] text-[#A1A1AA] border border-[#27272A]">
            Host Configuration Model
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
          Runtime engine parameters, concurrency policies, and server port configuration.
        </p>
      </div>

      <Card variant="surface" className="p-5 border-[#27272A] space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#18191E] border border-[#27272A] text-[#3B82F6] flex items-center justify-center shrink-0">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F4F4F5] font-mono">
              Declarative Host Configuration
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              In this self-hosted engine, settings are configured declaratively in{' '}
              <code className="text-[#3B82F6] font-mono">.env</code> and{' '}
              <code className="text-[#3B82F6] font-mono">src/config/config.ts</code>. In-browser runtime modification is disabled
              to prevent configuration drift and unauthorized mutation.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F4F5] font-mono">
              <Terminal className="w-3.5 h-3.5 text-[#3B82F6]" />
              Environment Variables
            </div>
            <ul className="text-[11px] text-[#71717A] space-y-1 font-mono">
              <li><span className="text-[#D4D4D8]">PORT</span>: Express server port (default: 3000)</li>
              <li><span className="text-[#D4D4D8]">GITHUB_TOKEN</span>: GitHub commit status reporting</li>
              <li><span className="text-[#D4D4D8]">GITHUB_WEBHOOK_SECRET</span>: HMAC-SHA256 signature key</li>
              <li><span className="text-[#D4D4D8]">MANAGEMENT_SECRET</span>: Optional token for management API</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#34D399] font-mono">
              <Cpu className="w-3.5 h-3.5 text-[#10B981]" />
              Process &amp; Workspace Limits
            </div>
            <ul className="text-[11px] text-[#71717A] space-y-1 font-mono">
              <li><strong className="text-[#D4D4D8]">Process Isolation</strong>: Jobs execute in dedicated child processes.</li>
              <li><strong className="text-[#D4D4D8]">Cancellation</strong>: Process trees terminated via taskkill (Win) or SIGKILL.</li>
              <li><strong className="text-[#D4D4D8]">Lifecycle</strong>: Run history is persisted per engine instance.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;
