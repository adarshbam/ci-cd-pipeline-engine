import React from 'react';
import { ShieldCheck, Lock, FileCode, AlertTriangle, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useNavigate } from 'react-router-dom';

export const SecretsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            Secrets & Security Architecture
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Local .env Model
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Cryptographic token security policies and secret isolation for the self-hosted GitHub CI/CD Engine.
        </p>
      </div>

      <Card variant="surface" className="p-6 border-[#1c2e4f] space-y-5 bg-[#090f1d]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono">
              Zero-Exposure Secret Management
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              In accordance with Milestone 5 security principles, secrets and tokens are{' '}
              <strong>never stored in the browser, never returned by management APIs</strong>, and
              never editable via insecure web forms.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-300 font-mono">
              <FileCode className="w-4 h-4 text-sky-400" />
              1. Host Environment (.env)
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Configure credentials exclusively in the root <code className="text-slate-200">.env</code> file.
              The backend engine parses variables on startup and uses them exclusively inside isolated process runners.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 font-mono">
              <Lock className="w-4 h-4 text-emerald-400" />
              2. Cryptographic Masking
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Workflow inspection endpoints automatically mask all sensitive environment variable values to{' '}
              <code className="text-slate-200">********</code> before transmission.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Dynamic Vault / KMS secret syncing is scheduled for post-MVP. Configure your local tokens via{' '}
              <strong>GitHub Integration Setup</strong>.
            </span>
          </div>
          <button
            onClick={() => navigate('/integrations')}
            className="flex items-center gap-1 text-xs font-mono font-semibold text-amber-300 hover:text-white px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition-colors shrink-0 ml-3"
          >
            Setup Guide <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default SecretsPage;
