import React from 'react';
import { Rocket, Box, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useNavigate } from 'react-router-dom';

export const DeploymentsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            Deployments & Environments
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Workflow JSON Managed
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Production targets, staging previews, health probes, and automated rollback policies.
        </p>
      </div>

      <Card variant="surface" className="p-6 border-[#1c2e4f] space-y-5 bg-[#090f1d]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <Rocket className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-mono">
              Declarative Target Routing in Workflows
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              In this MVP, deployment stages and health rollback triggers are defined directly within your workflow definitions (e.g.{' '}
              <code className="text-sky-300">workflows/day7-health-rollback.json</code>).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 font-mono">
              <Box className="w-4 h-4 text-sky-400" />
              Target Environments
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Workflows can specify <code className="text-slate-200">environments.test</code> and{' '}
              <code className="text-slate-200">environments.prod</code> configurations including health check URLs and environment file paths.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#060a14] border border-[#17253d] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 font-mono">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Automated Rollbacks
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When a deployment step fails or an HTTP health check returns non-200, the engine's built-in scheduler executes declared rollback steps automatically.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#060a14] border border-[#1c2e4f] flex items-center justify-between text-xs text-slate-300">
          <span>Explore and trigger deployment workflows from the active catalog:</span>
          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-1.5 text-xs font-mono font-semibold text-sky-300 hover:text-white px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 transition-colors"
          >
            Open Workflows <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default DeploymentsPage;
