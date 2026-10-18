import { Router } from "express";
import type { Workflow } from "../workflow/workflow.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import { resolveEnvironment } from "../environments/environment-resolver.js";
import { readLogEntries, type LogQuery } from "../logging/log-reader.js";

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
      
    });
  }

  return router;
}
