import express from "express";
import type { Request, Response } from "express";
import { existsSync } from "node:fs";
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

const webhookRouter = createWebhookRouter(workflows, { restoreHistory: true });

app.use(webhookRouter);

// Serve Dashboard dist static files if built
const dashboardDist = path.resolve("dashboard/dist");
const dashboardIndex = path.join(dashboardDist, "index.html");
app.use(express.static(dashboardDist));

// Unmatched /api/* routes return clean JSON 404
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// SPA fallback for client-side React Router routes
const SPA_PREFIXES = [
  "/dashboard",
  "/workflows",
  "/runs",
  "/artifacts",
  "/integrations",
  "/deployments",
  "/secrets",
  "/settings",
];

app.use((req: Request, res: Response, next) => {
  if (
    req.method === "GET" &&
    existsSync(dashboardIndex) &&
    SPA_PREFIXES.some(
      (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
    )
  ) {
    return res.sendFile(dashboardIndex);
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Run ngrok at ${PORT} using this command`);
  console.log(`ngrok http ${String(PORT)}`);
});
