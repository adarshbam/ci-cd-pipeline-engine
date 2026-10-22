import { resolveEnvironment } from "../environments/environment-resolver.js";
import { createLogEntry } from "../logging/log-entry.js";
import { appendLogEntry } from "../logging/log-store.js";
import {
  MetricsCollector,
  type MetricsSnapshot,
} from "../metrics/metrics-collector.js";
import { runScheduler } from "../scheduler/pipeline-scheduler.js";
import { saveRun } from "../storage/run-store.js";
import type { Environment, Workflow } from "../workflow/workflow.js";
import RunPipeline from "./pipeline-run.js";

class PipelineEngine {
  private workflow: Workflow;
  private runs = new Map<string, RunPipeline>();
  private completionPromises = new Map<string, Promise<void>>();
  private abortControllers = new Map<string, AbortController>();
  private metrics = new MetricsCollector();

  constructor(workflow: Workflow) {
    this.workflow = workflow;
  }

  async run(branch?: string): Promise<RunPipeline> {
    let resolvedEnvironment: Environment | undefined;

    if (branch !== undefined) {
      resolvedEnvironment = resolveEnvironment(branch);
    }
    const pipelineRun = new RunPipeline(
      this.workflow,
      branch,
      resolvedEnvironment,
    );

    const abortController = new AbortController();
    this.abortControllers.set(pipelineRun.id, abortController);

    pipelineRun.start();
    await appendLogEntry(
      createLogEntry({
        runId: pipelineRun.id,
        level: "INFO",
        message: "Pipeline started",
      }),
    );
    this.metrics.startRun(pipelineRun.id);
    this.runs.set(pipelineRun.id, pipelineRun);
    saveRun(pipelineRun).catch(() => {});

    const completionPromise = runScheduler(
      this.workflow,
      pipelineRun,
      abortController.signal,
    )
      .then(async () => {
        this.abortControllers.delete(pipelineRun.id);

        if (pipelineRun.status === "CANCELLED") {
          this.metrics.cancelRun(pipelineRun.id);
          saveRun(pipelineRun).catch(() => {});
          await appendLogEntry(
            createLogEntry({
              runId: pipelineRun.id,
              level: "WARN",
              message: "Pipeline cancelled by user",
            }),
          );
          return;
        }

        const succeeded = pipelineRun.status === "SUCCESS";
        this.metrics.finishRun(
          pipelineRun.id,
          succeeded ? "SUCCESS" : "FAILED",
        );
        saveRun(pipelineRun).catch(() => {});

        await appendLogEntry(
          createLogEntry({
            runId: pipelineRun.id,
            level: succeeded ? "INFO" : "ERROR",
            message: succeeded
              ? "Pipeline completed successfully"
              : "Pipeline failed: One or more jobs failed",
          }),
        );
      })
      .catch(async (err) => {
        this.abortControllers.delete(pipelineRun.id);

        if (pipelineRun.status === "CANCELLED") {
          this.metrics.cancelRun(pipelineRun.id);
          saveRun(pipelineRun).catch(() => {});
          return;
        }

        console.error("Scheduler failed:", err);

        if (pipelineRun.status === "RUNNING") {
          pipelineRun.fail();
        }

        this.metrics.finishRun(pipelineRun.id, "FAILED");
        saveRun(pipelineRun).catch(() => {});

        await appendLogEntry(
          createLogEntry({
            runId: pipelineRun.id,
            level: "ERROR",
            message: `Pipeline failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          }),
        );
      })
      .catch((err) => {
        console.error("Pipeline finalization failed:", err);
      });

    this.completionPromises.set(pipelineRun.id, completionPromise);

    return pipelineRun;
  }

  async cancelRun(runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) return false;

    if (run.status === "SUCCESS" || run.status === "FAILED") {
      return false;
    }

    if (run.status === "CANCELLED") {
      return true;
    }

    run.cancel();

    const controller = this.abortControllers.get(runId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(runId);
    }

    this.metrics.cancelRun(runId);

    for (const job of Object.values(run.jobs)) {
      if (job.status === "RUNNING" || job.status === "QUEUED") {
        job.status = "CANCELLED";
        job.failureReason = "Cancelled by user";
      }
    }

    saveRun(run).catch(() => {});

    await appendLogEntry(
      createLogEntry({
        runId: run.id,
        level: "WARN",
        message: "Pipeline cancelled by user",
      }),
    ).catch(() => {});

    return true;
  }

  addHistoricalRun(run: RunPipeline): void {
    if (!this.runs.has(run.id)) {
      this.runs.set(run.id, run);
    }
  }

  getRun(runId: string): RunPipeline | undefined {
    return this.runs.get(runId);
  }

  getAllRuns(): RunPipeline[] {
    return Array.from(this.runs.values());
  }

  getMetricsSnapshot(): MetricsSnapshot {
    return this.metrics.getSnapshot();
  }

  getActiveRunCount(): number {
    return this.metrics.getActiveRunCount();
  }

  async waitForCompletion(runId: string): Promise<RunPipeline> {
    const run = this.runs.get(runId);
    const completedPromise = this.completionPromises.get(runId);
    if (!run || !completedPromise) throw new Error("Run not found");
    await completedPromise;
    return run;
  }
}

export default PipelineEngine;
