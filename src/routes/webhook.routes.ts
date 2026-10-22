import type { Workflow } from "../workflow/workflow.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import { resolveEnvironment } from "../environments/environment-resolver.js";
import { readLogEntries, type LogQuery } from "../logging/log-reader.js";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, raw, json } from "express";
import type { Request } from "express";
import { extractGitHubPush, type GitHubPushInfo } from "./github-payload.js";
import { reportGitHubCommitStatus } from "../github/commit-status.js";
import { getGitHubToken } from "../github/github-credentials.js";
import { PORT } from "../config/config.js";
import { loadAllStoredRuns, getStoredRun } from "../storage/run-store.js";
import RunPipeline from "../pipeline/pipeline-run.js";

// Helper: Verify local or authenticated management access
function isAuthorizedManagement(req: Request): boolean {
  const configuredSecret = process.env.MANAGEMENT_SECRET?.trim();
  const tokenHeader = (
    req.header("x-management-token") ||
    req.header("authorization")?.replace(/^Bearer\s+/i, "")
  )?.trim();

  // 1. If MANAGEMENT_SECRET is configured, require explicit valid credentials
  if (configuredSecret) {
    return Boolean(tokenHeader && tokenHeader === configuredSecret);
  }

  // 2. Reject public tunnel / reverse proxy requests if MANAGEMENT_SECRET is not configured
  const forwardedFor = req.header("x-forwarded-for");
  const forwardedHost = req.header("x-forwarded-host");
  const forwardedProto = req.header("x-forwarded-proto");
  const hostHeader = (req.header("host") || "").toLowerCase();

  const isThroughTunnelOrProxy =
    Boolean(forwardedFor || forwardedHost || forwardedProto) ||
    hostHeader.includes("ngrok") ||
    hostHeader.includes(".dev") ||
    hostHeader.includes(".app") ||
    (!hostHeader.startsWith("localhost") &&
      !hostHeader.startsWith("127.0.0.1") &&
      !hostHeader.startsWith("[::1]"));

  if (isThroughTunnelOrProxy) {
    return false;
  }

  // 3. Verify loopback address for direct local connections
  const remoteIp = req.ip || req.socket?.remoteAddress || "";
  const isLoopback =
    remoteIp === "127.0.0.1" ||
    remoteIp === "::1" ||
    remoteIp === "::ffff:127.0.0.1" ||
    remoteIp.endsWith("127.0.0.1");

  if (!isLoopback) {
    return false;
  }

  // 4. CSRF Protection for state-changing operations (POST / PUT / DELETE)
  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    const origin = req.header("origin");
    const referer = req.header("referer");

    if (origin || referer) {
      const checkUrl = origin || referer || "";
      const isAllowedOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(checkUrl);
      if (!isAllowedOrigin) {
        return false;
      }
    }
  }

  return true;
}

function requireManagementAuth(req: Request, res: any, next: any) {
  if (!isAuthorizedManagement(req)) {
    const configuredSecret = process.env.MANAGEMENT_SECRET?.trim();
    if (configuredSecret) {
      return res.status(401).json({
        error: "Unauthorized: Missing or invalid x-management-token header",
      });
    }
    return res.status(403).json({
      error:
        "Forbidden: Management API access is restricted to authenticated or direct local loopback connections",
    });
  }
  next();
}

// 4. Parse and validate pagination parameters
function parsePaginationValue(
  value: unknown,
  defaultValue: number,
): number | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

export function verifyGitHubSignature(
  body: Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!secret) {
    return false;
  }

  // GitHub signatures use sha256= followed by 64 hex characters.
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const expectedSignature =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  const received = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

export type GitHubPushHandler = (
  push: GitHubPushInfo,
  deliveryId: string,
) => Promise<void>;

export function createGitHubWebhookRouter(
  webhookPath: string,
  onPush?: GitHubPushHandler,
): Router {
  const router = Router();

  router.post(
    webhookPath,
    raw({
      type: "application/json",
      limit: "1mb",
    }),
    async (req, res) => {
      // 1. Validate Content-Type
      if (!req.is("application/json")) {
        return res.status(415).json({
          error: "Unsupported content type",
        });
      }

      // 2. Read GitHub headers
      const event = req.header("x-github-event");
      const deliveryId = req.header("x-github-delivery");
      const signature = req.header("x-hub-signature-256");

      if (!event || !deliveryId) {
        return res.status(400).json({
          error: "Missing required GitHub headers",
        });
      }

      // 3. Preserve and validate the raw request body
      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({
          error: "Missing raw request body",
        });
      }

      // 4. Require a configured webhook secret
      const secret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!secret) {
        return res.status(503).json({
          error: "GitHub webhook secret not configured",
        });
      }

      // 5. Require a signature
      if (!signature) {
        return res.status(401).json({
          error: "Missing GitHub signature",
        });
      }

      // 6. Verify BEFORE parsing or processing the payload
      const validSignature = verifyGitHubSignature(req.body, signature, secret);

      if (!validSignature) {
        return res.status(401).json({
          error: "Invalid GitHub signature",
        });
      }

      // 7. Parse authenticated JSON
      let payload: unknown;

      try {
        payload = JSON.parse(req.body.toString("utf8"));
      } catch {
        return res.status(400).json({
          error: "Invalid JSON payload",
        });
      }

      void payload;

      if (event === "push") {
        let pushInfo: GitHubPushInfo;

        try {
          pushInfo = extractGitHubPush(payload);
        } catch {
          return res.status(400).json({
            error: "Invalid GitHub push payload",
          });
        }

        if (onPush) {
          try {
            await onPush(pushInfo, deliveryId);
          } catch (error) {
            console.error("Failed to start pipeline:", error);

            return res.status(500).json({
              error: "Failed to start pipeline",
            });
          }
        }
      }

      // 8. Acknowledge the delivery
      return res.status(200).json({
        received: true,
        event,
        deliveryId,
      });
    },
  );

  return router;
}

export interface WorkflowValidation {
  isValid: boolean;
  errors: string[];
}

export function validateWorkflow(wf: Workflow): WorkflowValidation {
  const errors: string[] = [];
  if (!wf.name || typeof wf.name !== "string") {
    errors.push("Workflow name is missing or invalid");
  }
  if (!wf.webhook?.url) {
    errors.push("Webhook URL configuration is missing");
  }
  if (!wf.jobs || Object.keys(wf.jobs).length === 0) {
    errors.push("Workflow must configure at least one job");
  } else {
    const jobNames = new Set(Object.keys(wf.jobs));
    for (const [jobName, job] of Object.entries(wf.jobs)) {
      if (!job.steps || !Array.isArray(job.steps) || job.steps.length === 0) {
        errors.push(`Job '${jobName}' must contain at least one step`);
      }
      if (job.needs && Array.isArray(job.needs)) {
        for (const dep of job.needs) {
          if (!jobNames.has(dep)) {
            errors.push(`Job '${jobName}' depends on missing job '${dep}'`);
          }
        }
      }
    }
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

export interface WebhookDeliveryRecord {
  id: string;
  workflowName: string;
  event: string;
  repository: string;
  branch: string;
  commitSha: string;
  sender?: string;
  timestamp: string;
  status: "accepted" | "rejected" | "skipped";
}

function getLatestRun(runs: any[]): any | undefined {
  if (runs.length === 0) return undefined;
  let latest = runs[0];
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    if (r && latest && new Date(r.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
      latest = r;
    }
  }
  return latest;
}

export function createWebhookRouter(workflows: Workflow[]) {
  const router = Router();
  const processedDeliveries = new Set<string>();
  const engines = new Map<string, PipelineEngine>();
  const recentDeliveries: WebhookDeliveryRecord[] = [];

  for (const workflow of workflows) {
    const engine = new PipelineEngine(workflow);
    engines.set(workflow.name, engine);
  }

  // Load and recover persistent runs from disk across server restarts
  loadAllStoredRuns()
    .then((storedRuns) => {
      for (const stored of storedRuns) {
        const engine = engines.get(stored.pipelineId);
        if (engine) {
          engine.addHistoricalRun(RunPipeline.fromStored(stored));
        }
      }
    })
    .catch((err) => {
      console.error("[RunStore] Failed to load historical runs into engines:", err);
    });

  for (const workflow of workflows) {
    const engine = engines.get(workflow.name)!;
    const methods = workflow.webhook.methods ?? ["GET"];

    if (methods.includes("GET")) {
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
                error:
                  error instanceof Error ? error.message : "Invalid branch",
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
    }

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

    router.post(
      `${workflow.webhook.url}/runs/:runId/cancel`,
      async (req, res) => {
        if (!isAuthorizedManagement(req)) {
          return res.status(403).json({
            error:
              "Forbidden: Cancellation requires local or authenticated management credentials",
          });
        }

        const { runId } = req.params;
        const run = engine.getRun(runId);
        if (!run) {
          return res.status(404).json({ error: "Run not found" });
        }

        await engine.cancelRun(runId);
        return res.status(200).json({
          runId: run.id,
          pipelineId: run.pipelineId,
          status: run.status,
          jobs: run.jobs,
        });
      },
    );

    router.get(`${workflow.webhook.url}/runs/:runId/logs`, async (req, res) => {
      const { runId } = req.params;
      const { level, jobId } = req.query;

      const run = engine.getRun(runId);

      // 1. Validate pipeline run
      if (!run) {
        return res.status(404).json({
          error: "Run not found",
        });
      }

      // 2. Validate log level
      if (
        level !== undefined &&
        level !== "INFO" &&
        level !== "WARN" &&
        level !== "ERROR"
      ) {
        return res.status(400).json({
          error: "Invalid log level",
        });
      }

      // 3. Validate job ID
      if (
        jobId !== undefined &&
        (typeof jobId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(jobId))
      ) {
        return res.status(400).json({
          error: "Invalid job ID",
        });
      }

      const limit = parsePaginationValue(req.query.limit, 50);
      const offset = parsePaginationValue(req.query.offset, 0);

      if (limit === undefined || limit < 1 || limit > 100) {
        return res.status(400).json({
          error: "Invalid limit. Must be between 1 and 100",
        });
      }

      if (offset === undefined) {
        return res.status(400).json({
          error: "Invalid offset. Must be a non-negative safe integer",
        });
      }

      try {
        // 5. Build optional filters
        const filters: LogQuery = {};

        if (level === "INFO" || level === "WARN" || level === "ERROR") {
          filters.level = level;
        }

        if (typeof jobId === "string") {
          filters.jobId = jobId;
        }

        // 6. Read matching logs
        const matchingLogs = await readLogEntries(runId, filters);

        // 7. Calculate total BEFORE pagination
        const total = matchingLogs.length;

        // 8. Apply pagination
        const logs = matchingLogs.slice(offset, offset + limit);

        // 9. Check for remaining entries
        const hasMore = offset + logs.length < total;

        // 10. Return response
        return res.status(200).json({
          runId: run.id,
          logs,
          pagination: {
            total,
            limit,
            offset,
            hasMore,
          },
        });
      } catch (error) {
        console.error("Failed to read logs:", error);

        return res.status(500).json({
          error: "Failed to read logs",
        });
      }
    });

    router.get(`${workflow.webhook.url}/metrics`, async (req, res) => {
      return res.json({
        ...engine.getMetricsSnapshot(),
        activeRuns: engine.getActiveRunCount(),
      });
    });

    if (methods.includes("POST")) {
      router.use(
        createGitHubWebhookRouter(
          workflow.webhook.url,
          async (push, deliveryId) => {
            // Check event subscription and allowed branches.
            const subscribed = workflow.trigger.events.includes("push");

            const allowedBranches = workflow.trigger.allowedBranches;

            const branchAllowed =
              !allowedBranches?.length || allowedBranches.includes(push.branch);

            if (!subscribed || !branchAllowed) {
              recentDeliveries.unshift({
                id: deliveryId,
                workflowName: workflow.name,
                event: "push",
                repository: push.repository,
                branch: push.branch,
                commitSha: push.commitSha,
                timestamp: new Date().toISOString(),
                status: "skipped",
              });
              if (recentDeliveries.length > 25) recentDeliveries.pop();
              return;
            }

            const repositories = workflow.trigger.allowedRepositories;

            const repositoryAllowed =
              repositories?.includes(push.repository) === true;

            if (!repositoryAllowed) {
              recentDeliveries.unshift({
                id: deliveryId,
                workflowName: workflow.name,
                event: "push",
                repository: push.repository,
                branch: push.branch,
                commitSha: push.commitSha,
                timestamp: new Date().toISOString(),
                status: "rejected",
              });
              if (recentDeliveries.length > 25) recentDeliveries.pop();
              return;
            }

            const deliveryKey = `${workflow.name}:${deliveryId}`;

            if (processedDeliveries.has(deliveryKey)) {
              return;
            }

            processedDeliveries.add(deliveryKey);

            recentDeliveries.unshift({
              id: deliveryId,
              workflowName: workflow.name,
              event: "push",
              repository: push.repository,
              branch: push.branch,
              commitSha: push.commitSha,
              timestamp: new Date().toISOString(),
              status: "accepted",
            });
            if (recentDeliveries.length > 25) recentDeliveries.pop();

            try {
              if (process.env.GITHUB_TOKEN?.trim()) {
                await reportGitHubCommitStatus({
                  repository: push.repository,
                  commitSha: push.commitSha,
                  state: "pending",
                  token: getGitHubToken(),
                  context: "custom-ci/pipeline",
                  description: "Pipeline running",
                  ...(process.env.GITHUB_API_BASE_URL
                    ? { apiBaseUrl: process.env.GITHUB_API_BASE_URL }
                    : {}),
                });
              }
              const run = await engine.run(push.branch);

              if (process.env.GITHUB_TOKEN?.trim()) {
                void engine
                  .waitForCompletion(run.id)
                  .then(async (completed) => {
                    const state =
                      completed.status === "SUCCESS" ? "success" : "failure";

                    // Report final state to GitHub here.
                    await reportGitHubCommitStatus({
                      repository: push.repository,
                      commitSha: push.commitSha,
                      state,
                      token: getGitHubToken(),
                      context: "custom-ci/pipeline",
                      description: "Pipeline completed run.",
                      ...(process.env.GITHUB_API_BASE_URL
                        ? { apiBaseUrl: process.env.GITHUB_API_BASE_URL }
                        : {}),
                    });
                  })
                  .catch((error) => {
                    console.error(
                      "GitHub final status reporting failed:",
                      error,
                    );
                  });
              }
            } catch (error) {
              processedDeliveries.delete(deliveryKey);
              throw error;
            }
          },
        ),
      );
    }
  }

  // ==========================================
  // Management & Dashboard REST API (/api/*)
  // ==========================================

  // 1. Overall System Status
  router.get("/api/status", (_req, res) => {
    let activeRuns = 0;
    for (const eng of engines.values()) {
      activeRuns += eng.getActiveRunCount();
    }
    return res.json({
      status: "online",
      activeRuns,
      totalWorkflows: workflows.length,
      port: String(PORT),
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // 2. List All Workflows with Rich Discovery Metadata
  router.get("/api/workflows", requireManagementAuth, (_req, res) => {
    const result = workflows.map((wf) => {
      const engine = engines.get(wf.name);
      const validation = validateWorkflow(wf);
      const allRuns = engine ? engine.getAllRuns() : [];
      const latestRun = getLatestRun(allRuns);

      return {
        name: wf.name,
        webhook: wf.webhook,
        trigger: wf.trigger,
        environments: wf.environments ? Object.keys(wf.environments) : [],
        jobCount: Object.keys(wf.jobs || {}).length,
        jobs: wf.jobs,
        isValid: validation.isValid,
        validationErrors: validation.errors,
        runsCount: allRuns.length,
        lastRun: latestRun
          ? {
              id: latestRun.id,
              status: latestRun.status,
              startedAt: latestRun.startedAt,
              finishedAt: latestRun.finishedAt,
              branch: latestRun.branch,
              durationMs:
                latestRun.finishedAt && latestRun.startedAt
                  ? new Date(latestRun.finishedAt).getTime() -
                    new Date(latestRun.startedAt).getTime()
                  : undefined,
            }
          : undefined,
      };
    });
    return res.json(result);
  });

  // 3. Read Individual Workflow Details & Preview (No Secrets)
  router.get("/api/workflows/:workflowName", requireManagementAuth, (req, res) => {
    const { workflowName } = req.params;
    if (typeof workflowName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(workflowName)) {
      return res.status(400).json({ error: "Invalid workflow name format" });
    }
    const wf = workflows.find((w) => w.name === workflowName);
    if (!wf) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    const engine = engines.get(wf.name);
    const validation = validateWorkflow(wf);
    const allRuns = engine ? engine.getAllRuns() : [];
    const latestRun = getLatestRun(allRuns);

    // Mask secret environment configurations
    const safeEnvironments = wf.environments
      ? {
          test: wf.environments.test
            ? {
                healthUrl: wf.environments.test.healthUrl,
                envConfigured: Boolean(wf.environments.test.envFile),
              }
            : undefined,
          prod: wf.environments.prod
            ? {
                healthUrl: wf.environments.prod.healthUrl,
                envConfigured: Boolean(wf.environments.prod.envFile),
              }
            : undefined,
        }
      : undefined;

    return res.json({
      workflow: {
        name: wf.name,
        webhook: wf.webhook,
        trigger: wf.trigger,
        environments: safeEnvironments,
        jobs: wf.jobs,
      },
      isValid: validation.isValid,
      validationErrors: validation.errors,
      jobCount: Object.keys(wf.jobs || {}).length,
      runsCount: allRuns.length,
      lastRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            startedAt: latestRun.startedAt,
            finishedAt: latestRun.finishedAt,
            branch: latestRun.branch,
            environment: latestRun.environment,
            durationMs:
              latestRun.finishedAt && latestRun.startedAt
                ? new Date(latestRun.finishedAt).getTime() -
                  new Date(latestRun.startedAt).getTime()
                : undefined,
          }
        : undefined,
      metrics: engine ? engine.getMetricsSnapshot() : undefined,
    });
  });

  // 4. Manually Trigger a Workflow (Management Authorized)
  router.post("/api/workflows/:workflowName/run", requireManagementAuth, json(), async (req, res) => {
    const { workflowName } = req.params;
    if (typeof workflowName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(workflowName)) {
      return res.status(400).json({ error: "Invalid workflow name format" });
    }
    const wf = workflows.find((w) => w.name === workflowName);
    const engine = engines.get(workflowName);

    if (!wf || !engine) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    const validation = validateWorkflow(wf);
    if (!validation.isValid) {
      return res.status(400).json({
        error: "Cannot trigger invalid workflow",
        validationErrors: validation.errors,
      });
    }

    const branch = (req.body?.branch ||
      req.query.branch ||
      wf.trigger.allowedBranches?.[0] ||
      "main") as string;

    try {
      const run = await engine.run(branch);
      return res.status(202).json({
        runId: run.id,
        pipelineId: run.pipelineId,
        status: run.status,
        branch: run.branch,
        environment: run.environment,
        createdAt: run.createdAt,
      });
    } catch (error) {
      console.error("Failed to trigger run:", error);
      return res.status(500).json({ error: "Failed to trigger pipeline run" });
    }
  });

  // 5. List Pipeline Runs (With Filtering and Pagination)
  router.get("/api/runs", requireManagementAuth, (req, res) => {
    const { workflow, status, limit, offset } = req.query;

    let allRuns: any[] = [];
    for (const eng of engines.values()) {
      allRuns.push(...eng.getAllRuns());
    }

    if (typeof workflow === "string" && workflow.trim()) {
      allRuns = allRuns.filter(
        (r) => r.pipelineId.toLowerCase() === workflow.trim().toLowerCase(),
      );
    }

    if (typeof status === "string" && status.trim() && status.toLowerCase() !== "all") {
      allRuns = allRuns.filter(
        (r) => r.status.toLowerCase() === status.trim().toLowerCase(),
      );
    }

    allRuns.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const parsedLimit = parsePaginationValue(limit, 50) ?? 50;
    const parsedOffset = parsePaginationValue(offset, 0) ?? 0;
    const total = allRuns.length;
    const paginated = allRuns.slice(parsedOffset, parsedOffset + parsedLimit);

    const formattedRuns = paginated.map((r) => {
      const jobsList = Object.values(r.jobs || {});
      const totalJobs = jobsList.length;
      const succeededJobs = jobsList.filter(
        (j: any) => j.status === "SUCCESS",
      ).length;
      const failedJobs = jobsList.filter(
        (j: any) => j.status === "FAILED",
      ).length;
      const firstFailedJob = jobsList.find(
        (j: any) => j.status === "FAILED",
      ) as any;

      return {
        id: r.id,
        pipelineId: r.pipelineId,
        status: r.status,
        createdAt: r.createdAt,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs:
          r.finishedAt && r.startedAt
            ? new Date(r.finishedAt).getTime() -
              new Date(r.startedAt).getTime()
            : undefined,
        branch: r.branch || "main",
        environment: r.environment,
        jobCount: totalJobs,
        succeededJobCount: succeededJobs,
        failedJobCount: failedJobs,
        failedJobId: firstFailedJob?.jobId,
        jobs: r.jobs,
      };
    });

    return res.json({
      runs: formattedRuns,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + paginated.length < total,
      },
      memoryNotice:
        "Engine Storage: Run history is preserved in memory and persisted to disk in runtime/history/runs across restarts.",
      storageNotice:
        "Persistent Engine Storage: Run history is saved to disk in runtime/history/runs and persists across server restarts.",
    });
  });

  // 6. Read Specific Run Details
  router.get("/api/runs/:runId", requireManagementAuth, async (req, res) => {
    const { runId } = req.params;
    if (typeof runId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(runId)) {
      return res.status(400).json({ error: "Invalid run ID format" });
    }
    let targetRun: any;

    for (const eng of engines.values()) {
      const run = eng.getRun(runId);
      if (run) {
        targetRun = run;
        break;
      }
    }

    if (!targetRun) {
      const stored = await getStoredRun(runId);
      if (stored) {
        targetRun = RunPipeline.fromStored(stored);
      }
    }

    if (!targetRun) {
      return res.status(404).json({ error: "Run not found" });
    }

    const jobsWithDeps: Record<string, any> = {};
    for (const [jId, jRun] of Object.entries(targetRun.jobs || {})) {
      jobsWithDeps[jId] = {
        ...(jRun as any),
        needs: targetRun.workflow?.jobs?.[jId]?.needs || [],
      };
    }

    const jobsList = Object.values(targetRun.jobs || {});
    const firstFailedJob = jobsList.find(
      (j: any) => j.status === "FAILED",
    ) as any;

    return res.status(200).json({
      runId: targetRun.id,
      pipelineId: targetRun.pipelineId,
      status: targetRun.status,
      createdAt: targetRun.createdAt,
      startedAt: targetRun.startedAt,
      finishedAt: targetRun.finishedAt,
      durationMs:
        targetRun.finishedAt && targetRun.startedAt
          ? new Date(targetRun.finishedAt).getTime() -
            new Date(targetRun.startedAt).getTime()
          : undefined,
      branch: targetRun.branch || "main",
      environment: targetRun.environment,
      jobs: jobsWithDeps,
      failedJobId: firstFailedJob?.jobId,
    });
  });

  // 7. Read Run Logs with Pagination & Filtering
  router.get("/api/runs/:runId/logs", requireManagementAuth, async (req, res) => {
    const { runId } = req.params;
    if (typeof runId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(runId)) {
      return res.status(400).json({ error: "Invalid run ID format" });
    }
    const { level, jobId } = req.query;

    let targetRun: any;
    for (const eng of engines.values()) {
      const run = eng.getRun(runId);
      if (run) {
        targetRun = run;
        break;
      }
    }

    if (!targetRun) {
      const stored = await getStoredRun(runId);
      if (stored) {
        targetRun = RunPipeline.fromStored(stored);
      }
    }

    if (!targetRun) {
      return res.status(404).json({ error: "Run not found" });
    }

    if (
      level !== undefined &&
      level !== "INFO" &&
      level !== "WARN" &&
      level !== "ERROR"
    ) {
      return res.status(400).json({ error: "Invalid log level" });
    }

    if (
      jobId !== undefined &&
      (typeof jobId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(jobId))
    ) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    const limit = parsePaginationValue(req.query.limit, 100) ?? 100;
    const offset = parsePaginationValue(req.query.offset, 0) ?? 0;

    try {
      const filters: LogQuery = {};
      if (level === "INFO" || level === "WARN" || level === "ERROR") {
        filters.level = level;
      }
      if (typeof jobId === "string") {
        filters.jobId = jobId;
      }

      const matchingLogs = await readLogEntries(runId, filters);
      const total = matchingLogs.length;
      const logs = matchingLogs.slice(offset, offset + limit);

      return res.status(200).json({
        runId: targetRun.id,
        logs,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + logs.length < total,
        },
      });
    } catch (error) {
      console.error("Failed to read logs:", error);
      return res.status(500).json({ error: "Failed to read logs" });
    }
  });

  // 8. Cancel an Active Pipeline Run (Management Authorized)
  router.post("/api/runs/:runId/cancel", requireManagementAuth, async (req, res) => {
    const { runId } = req.params;
    if (typeof runId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(runId)) {
      return res.status(400).json({ error: "Invalid run ID format" });
    }
    let targetEngine: PipelineEngine | undefined;
    let targetRun: any;

    for (const eng of engines.values()) {
      const run = eng.getRun(runId);
      if (run) {
        targetEngine = eng;
        targetRun = run;
        break;
      }
    }

    if (!targetEngine || !targetRun) {
      return res.status(404).json({ error: "Run not found" });
    }

    await targetEngine.cancelRun(runId);
    return res.status(200).json({
      runId: targetRun.id,
      pipelineId: targetRun.pipelineId,
      status: targetRun.status,
      jobs: targetRun.jobs,
    });
  });

  // 9. Overall Engine & Aggregate Metrics
  router.get("/api/metrics", requireManagementAuth, (_req, res) => {
    let totalRuns = 0;
    let activeRuns = 0;
    let successfulRuns = 0;
    let failedRuns = 0;
    let cancelledRuns = 0;
    let totalDurationMs = 0;
    let completedCountWithDuration = 0;

    for (const eng of engines.values()) {
      const snap = eng.getMetricsSnapshot();
      totalRuns += eng.getAllRuns().length;
      activeRuns += eng.getActiveRunCount();
      successfulRuns += snap.successfulRuns;
      failedRuns += snap.failedRuns;

      for (const r of eng.getAllRuns()) {
        if (r.status === "CANCELLED") cancelledRuns++;
        if (r.startedAt && r.finishedAt) {
          const dur =
            new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
          if (dur >= 0) {
            totalDurationMs += dur;
            completedCountWithDuration++;
          }
        }
      }
    }

    const completedTotal = successfulRuns + failedRuns;
    const successRate =
      completedTotal > 0
        ? Math.round((successfulRuns / completedTotal) * 1000) / 10
        : null;
    const avgDurationMs =
      completedCountWithDuration > 0
        ? Math.round(totalDurationMs / completedCountWithDuration)
        : null;

    return res.json({
      totalRuns,
      activeRuns,
      successfulRuns,
      failedRuns,
      cancelledRuns,
      successRate,
      avgDurationMs,
      totalWorkflows: workflows.length,
      timestamp: new Date().toISOString(),
    });
  });

  // 10. Engine Readiness & Integration Configuration Checklist
  router.get("/api/integrations/status", requireManagementAuth, (_req, res) => {
    let activeRuns = 0;
    let totalRuns = 0;
    for (const eng of engines.values()) {
      activeRuns += eng.getActiveRunCount();
      totalRuns += eng.getAllRuns().length;
    }

    const hasGithubToken = Boolean(process.env.GITHUB_TOKEN?.trim());
    const hasWebhookSecret = Boolean(process.env.GITHUB_WEBHOOK_SECRET?.trim());
    const publicBaseUrl =
      process.env.PUBLIC_WEBHOOK_BASE_URL ||
      process.env.DAY7_LIVE_BASE_URL ||
      null;
    const hasManagementSecret = Boolean(process.env.MANAGEMENT_SECRET?.trim());

    return res.json({
      backendOnline: true,
      port: String(PORT),
      loadedWorkflowsCount: workflows.length,
      activeRunsCount: activeRuns,
      totalRunsRecorded: totalRuns,
      githubTokenConfigured: hasGithubToken,
      githubWebhookSecretConfigured: hasWebhookSecret,
      publicWebhookBaseUrl: publicBaseUrl,
      managementSecretConfigured: hasManagementSecret,
      recentDeliveries: recentDeliveries.slice(0, 20),
      memoryPersistenceNotice:
        "In-Memory Engine Storage: Run history is stored in memory and will reset if the server process restarts.",
    });
  });

  // 11. Read-Only GitHub API Verification Probe (Management Authorized)
  router.post("/api/integrations/verify-github", requireManagementAuth, json(), async (req, res) => {

    const token = process.env.GITHUB_TOKEN?.trim();
    if (!token) {
      return res.status(200).json({
        verified: false,
        reason: "GITHUB_TOKEN is not configured in .env",
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const apiBase =
        process.env.GITHUB_API_BASE_URL || "https://api.github.com";
      const response = await fetch(`${apiBase}/user`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "GitHub-CICD-Engine",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data: any = await response.json();
        const scopesHeader = response.headers.get("x-oauth-scopes") || "";
        const scopes = scopesHeader
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        return res.status(200).json({
          verified: true,
          authenticatedUser: data.login || "verified-user",
          rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
          scopes,
          message: `GitHub API connection verified successfully as '${data.login || "user"}'`,
        });
      } else {
        return res.status(200).json({
          verified: false,
          statusCode: response.status,
          reason: `GitHub API returned HTTP ${response.status}: ${response.statusText}`,
        });
      }
    } catch (error: any) {
      return res.status(200).json({
        verified: false,
        reason:
          error?.name === "AbortError"
            ? "GitHub API request timed out"
            : error?.message || "Connection failed",
      });
    }
  });

  return router;
}
