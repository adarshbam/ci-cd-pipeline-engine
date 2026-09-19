import express from "express";
import type { Request, Response } from "express";
import "fs/promises";
import { readdir } from "fs/promises";
import path from "path";
import { PORT } from "./config/config.js";
import { loadWorkflows } from "./workflow/workflow-loader.js";
import { createWebhookRouter } from "./routes/webhook.routes.js";
import type { Workflow } from "./workflow/workflow.js";

const app = express();

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Hello from TypeScript + Express.",
  });
});

const workflows: Workflow[] = await loadWorkflows();

const webhookRouter = createWebhookRouter(workflows);

app.use(webhookRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Run ngrok at ${PORT} using this command`);

  console.log(`ngrok http ${String(PORT)}`);
});
