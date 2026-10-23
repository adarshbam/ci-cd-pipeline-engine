import React from 'react';
import { ShieldCheck, Lock, FileCode, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useNavigate } from 'react-router-dom';

export const SecretsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5] font-mono">
            Secrets &amp; Security Architecture
          </h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#0D1F17] text-[#34D399] border border-[#164E35]">
            Local .env Model
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
          Cryptographic token security policies and secret isolation for the self-hosted GitHub CI/CD Engine.
        </p>
      </div>

      <Card variant="surface" className="p-5 border-[#27272A] space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#0D1F17] border border-[#164E35] text-[#34D399] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F4F4F5] font-mono">
              Zero-Exposure Secret Management
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              Secrets and tokens are{' '}
              <strong className="text-[#F4F4F5]">never stored in the browser, never returned by management APIs</strong>, and
              never editable via insecure web forms.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#D4D4D8] font-mono">
              <FileCode className="w-3.5 h-3.5 text-[#3B82F6]" />
              1. Host Environment (.env)
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed font-mono">
              Configure credentials exclusively in the root <code className="text-[#D4D4D8]">.env</code> file.
              The backend engine parses variables on startup and uses them exclusively inside isolated process runners.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#34D399] font-mono">
              <Lock className="w-3.5 h-3.5 text-[#10B981]" />
              2. Cryptographic Masking
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed font-mono">
              Workflow inspection endpoints automatically mask all sensitive environment variable values to{' '}
              <code className="text-[#D4D4D8]">********</code> before transmission.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#1A160F] border border-[#3E2B15] text-[#FDE68A] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span>
              Dynamic Vault / KMS secret syncing is scheduled for post-MVP. Configure local tokens via{' '}
              <strong>GitHub Integration Setup</strong>.
            </span>
          </div>
          <button
            onClick={() => navigate('/integrations')}
            className="flex items-center gap-1 text-xs font-mono font-medium text-[#F59E0B] hover:text-white px-2 py-1 rounded bg-[#271E10] border border-[#4C3415] hover:bg-[#382B17] transition-colors shrink-0 ml-3"
          >
            Setup Guide <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default SecretsPage;
