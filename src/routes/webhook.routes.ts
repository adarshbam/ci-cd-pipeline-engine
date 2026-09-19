import { Router } from "express";
import type { Workflow } from "../workflow/workflow.js";
import { runScript } from "../steps/script-runner.js";

export function createWebhookRouter(workflows: Workflow[]) {
  const router = Router();

  for (const workflow of workflows) {
    router.get(`${workflow.webhook.url}`, async (req, res) => {
      // runScript(workflow);
      console.log(workflow)

      return res.status(200).json({
        workflow,
      });
    });
  }

  return router;
}
