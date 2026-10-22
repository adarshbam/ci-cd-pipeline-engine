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

// Strict CORS restricted to local development origins
app.use((req, res, next) => {
  const origin = req.header("origin");
  const isAllowedOrigin =
    origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

  if (isAllowedOrigin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-management-token, x-requested-with, x-github-event, x-github-delivery, x-hub-signature-256",
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "GitHub CI/CD Engine API Online",
    version: "1.0.0",
  });
});

const workflows: Workflow[] = await loadWorkflows();

const webhookRouter = createWebhookRouter(workflows);

app.use(webhookRouter);

// Serve Dashboard dist static files if built
const dashboardDist = path.resolve("dashboard/dist");
app.use(express.static(dashboardDist));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Run ngrok at ${PORT} using this command`);
  console.log(`ngrok http ${String(PORT)}`);
});
