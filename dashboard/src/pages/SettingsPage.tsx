import React from 'react';
import { Settings as SettingsIcon, Server, ShieldCheck, Terminal, Cpu } from 'lucide-react';
import { Card } from '../components/ui/Card';

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            Engine Configuration & Settings
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Host Configuration Model
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Runtime engine parameters, concurrency policies, and server port configuration.
        </p>
      </div>

      <Card variant="surface" className="p-6 border-[#1c2e4f] space-y-5 bg-[#090f1d]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono">
              Declarative Host Configuration
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              In this self-hosted open-source engine, settings are configured declaratively in{' '}
              <code className="text-sky-300">.env</code> and{' '}
              <code className="text-sky-300">src/config/config.ts</code>. In-browser runtime modification is disabled
              to prevent configuration drift and unauthorized mutation.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 font-mono">
              <Terminal className="w-4 h-4 text-sky-400" />
              Environment Variables
            </div>
            <ul className="text-[11px] text-slate-400 space-y-1.5 font-mono">
              <li><span className="text-sky-300">PORT</span>: Express server port (default: 3000)</li>
              <li><span className="text-sky-300">GITHUB_TOKEN</span>: GitHub commit status reporting</li>
              <li><span className="text-sky-300">GITHUB_WEBHOOK_SECRET</span>: HMAC-SHA256 signature key</li>
              <li><span className="text-sky-300">MANAGEMENT_SECRET</span>: Optional token for management API</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 font-mono">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Process & Workspace Limits
            </div>
            <ul className="text-[11px] text-slate-400 space-y-1.5">
              <li><strong className="text-slate-200 font-mono">Process Isolation</strong>: Jobs execute in dedicated child processes.</li>
              <li><strong className="text-slate-200 font-mono">Cancellation</strong>: Process trees terminated via <code className="text-slate-300">taskkill /T /F</code> (Win) or <code className="text-slate-300">SIGKILL</code> (POSIX).</li>
              <li><strong className="text-slate-200 font-mono">Lifecycle</strong>: Run history is strictly in-memory per engine instance.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;
