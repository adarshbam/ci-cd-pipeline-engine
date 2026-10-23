import React from 'react';
import { Rocket, Box, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useNavigate } from 'react-router-dom';

export const DeploymentsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F4F4F5] font-mono">
            Deployments &amp; Environments
          </h1>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#18191E] text-[#A1A1AA] border border-[#27272A]">
            Workflow JSON Managed
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#A1A1AA] mt-1">
          Production targets, staging previews, health probes, and automated rollback policies.
        </p>
      </div>

      <Card variant="surface" className="p-5 border-[#27272A] space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-[#18191E] border border-[#27272A] text-[#3B82F6] flex items-center justify-center shrink-0">
            <Rocket className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#F4F4F5] font-mono">
              Declarative Target Routing in Workflows
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              In this engine, deployment stages and health rollback triggers are defined directly within your workflow definitions (e.g.{' '}
              <code className="text-[#3B82F6] font-mono">workflows/day7-health-rollback.json</code>).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F4F5] font-mono">
              <Box className="w-3.5 h-3.5 text-[#3B82F6]" />
              Target Environments
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed font-mono">
              Workflows can specify <code className="text-[#D4D4D8]">environments.test</code> and{' '}
              <code className="text-[#D4D4D8]">environments.prod</code> configurations including health check URLs.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-[#141519] border border-[#22242A] space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#34D399] font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
              Automated Rollbacks
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed font-mono">
              When a deployment step fails or an HTTP health check returns non-200, the engine's built-in scheduler executes declared rollback steps automatically.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#141519] border border-[#22242A] flex items-center justify-between text-xs text-[#A1A1AA]">
          <span>Explore and trigger deployment workflows from the active catalog:</span>
          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-1.5 text-xs font-mono font-medium text-[#3B82F6] hover:text-white px-2.5 py-1 rounded bg-[#18191E] border border-[#27272A] hover:bg-[#20222A] transition-colors"
          >
            Open Workflows <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </Card>
    </div>
  );
};

export default DeploymentsPage;
