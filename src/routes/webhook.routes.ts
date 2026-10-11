import { Router } from "express";
import type { Workflow } from "../workflow/workflow.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";

export function createWebhookRouter(workflows: Workflow[]) {
  const router = Router();

  for (const workflow of workflows) {
    const engine = new PipelineEngine(workflow);

    router.get(`${workflow.webhook.url}`, async (req, res) => {
      try { 
        const pipelineRun = await engine.run();

        return res.status(202).json({
          runId: pipelineRun.id,
          piplelineId: pipelineRun.pipelineId,
          status: pipelineRun.status,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({
          error: "Failed to create pipeline run",
        });
      }
    });
  }

  return router;
}
