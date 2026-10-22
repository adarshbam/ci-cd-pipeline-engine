import { resolveEnvironment } from "../environments/environment-resolver.js";
import { createLogEntry } from "../logging/log-entry.js";
import { appendLogEntry } from "../logging/log-store.js";
import {
  MetricsCollector,
  type MetricsSnapshot,
} from "../metrics/metrics-collector.js";
import { runScheduler } from "../scheduler/pipeline-scheduler.js";
import type { Environment, Workflow } from "../workflow/workflow.js";
import RunPipeline from "./pipeline-run.js";

class PipelineEngine {
  private workflow: Workflow;
  private runs = new Map<string, RunPipeline>();
  private completionPromises = new Map<string, Promise<void>>();
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

    const completionPromise = runScheduler(this.workflow, pipelineRun)
      .then(async () => {
        const succeeded = pipelineRun.status === "SUCCESS";

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
        console.error("Scheduler failed:", err);

        if (pipelineRun.status === "RUNNING") {
          pipelineRun.fail();
        }

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
      .finally(() => {
        if (pipelineRun.status === "RUNNING") {
          pipelineRun.fail();
        }

        this.metrics.finishRun(
          pipelineRun.id,
          pipelineRun.status === "SUCCESS" ? "SUCCESS" : "FAILED",
        );
      })
      .catch((err) => {
        console.error("Pipeline finalization failed:", err);
      });

    this.completionPromises.set(pipelineRun.id, completionPromise);

    return pipelineRun;
  }

  getRun(runId: string): RunPipeline | undefined {
    // Retrieve the run from your Map
    return this.runs.get(runId);
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
