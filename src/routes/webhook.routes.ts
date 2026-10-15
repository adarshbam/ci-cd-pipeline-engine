import { Router } from "express";
import type { Workflow } from "../workflow/workflow.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import { resolveEnvironment } from "../environments/environment-resolver.js";

export function createWebhookRouter(workflows: Workflow[]) {
  const router = Router();

  for (const workflow of workflows) {
    const engine = new PipelineEngine(workflow);

    router.get(`${workflow.webhook.url}`, async (req, res) => {
      try {
        const branch = req.query.branch;

        if (branch !== undefined && typeof branch !== "string") {
          return res.status(400).json({
            error: "Invalid branch type",
          });
        }

        if (branch !== undefined) {
          try {
            resolveEnvironment(branch);
          } catch (error) {
            return res.status(400).json({
              error: error instanceof Error ? error.message : "Invalid branch",
            });
          }
        }

        const pipelineRun = await engine.run(branch);

        return res.status(202).json({
          runId: pipelineRun.id,
          pipelineId: pipelineRun.pipelineId,
          status: pipelineRun.status,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({
          error: "Failed to create pipeline run",
        });
      }
    });

    router.get(`${workflow.webhook.url}/runs/:runId`, async (req, res) => {
      let { runId } = req.params;

      const run = engine.getRun(runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      return res.status(200).json({
        runId: run.id,
        pipelineId: run.pipelineId,
        status: run.status,
        jobs: run.jobs,
      });
    });
  }

  return router;
}
