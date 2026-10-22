import React from 'react';
import { Package, FolderGit2, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useNavigate } from 'react-router-dom';

export const ArtifactsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            Artifacts & Workspace Isolation
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Workspace Filesystem
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Build packages, test logs, and binary outputs produced by pipeline execution runs.
        </p>
      </div>

      <Card variant="surface" className="p-6 border-[#1c2e4f] space-y-5 bg-[#090f1d]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono">
              Local Workspace Architecture
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Every job in this engine runs in an isolated temporary workspace located in{' '}
              <code className="text-sky-300">runtime/workspaces/&lt;runId&gt;/&lt;jobId&gt;</code>.
              Generated outputs are preserved per run lifecycle.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 font-mono">
              <FolderGit2 className="w-4 h-4 text-sky-400" />
              Cross-Job Artifacts
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When workflows declare <code className="text-slate-200">artifacts</code> in job definitions, outputs are transferred across dependent pipeline stages via the engine's <code className="text-slate-200">ArtifactManager</code>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 font-mono">
              <Package className="w-4 h-4 text-emerald-400" />
              S3 / OCI Remote Registries
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Distributed object storage upload and browser zip downloads are scheduled for post-MVP. Step logs can be inspected immediately in Run History.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#060a14] border border-[#1c2e4f] flex items-center justify-between text-xs text-slate-300">
          <span>Inspect job outputs and execution logs across your pipeline runs:</span>
          <button
            onClick={() => navigate('/runs')}
            className="flex items-center gap-1.5 text-xs font-mono font-semibold text-sky-300 hover:text-white px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 transition-colors"
          >
            View Runs <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default ArtifactsPage;
