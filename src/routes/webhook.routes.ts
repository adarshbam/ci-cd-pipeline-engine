import type { Workflow } from "../workflow/workflow.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import { resolveEnvironment } from "../environments/environment-resolver.js";
import { readLogEntries, type LogQuery } from "../logging/log-reader.js";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, raw } from "express";
import { extractGitHubPush, type GitHubPushInfo } from "./github-payload.js";
import { reportGitHubCommitStatus } from "../github/commit-status.js";
import { getGitHubToken } from "../github/github-credentials.js";

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

export function createWebhookRouter(workflows: Workflow[]) {
  const router = Router();
  const processedDeliveries = new Set<string>();

  for (const workflow of workflows) {
    const engine = new PipelineEngine(workflow);

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
              return;
            }

            const repositories = workflow.trigger.allowedRepositories;

            const repositoryAllowed =
              repositories?.includes(push.repository) === true;

            if (!repositoryAllowed) return;

            const deliveryKey = `${workflow.name}:${deliveryId}`;

            if (processedDeliveries.has(deliveryKey)) {
              return;
            }

            processedDeliveries.add(deliveryKey);

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
              // We'll use this run in the upcoming mini-exercises.
            } catch (error) {
              processedDeliveries.delete(deliveryKey);
              throw error;
            }
          },
        ),
      );
    }
  }

  return router;
}
