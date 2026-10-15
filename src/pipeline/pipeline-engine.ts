import { resolveEnvironment } from "../environments/environment-resolver.js";
import { runScheduler } from "../scheduler/pipeline-scheduler.js";
import type { Environment, Workflow } from "../workflow/workflow.js";
import RunPipeline from "./pipeline-run.js";

class PipelineEngine {
  private workflow: Workflow;
  private runs = new Map<string, RunPipeline>();

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
    this.runs.set(pipelineRun.id, pipelineRun);

    runScheduler(this.workflow, pipelineRun).catch((err) => {
      console.error("Scheduler failed:", err);

      if (pipelineRun.status === "RUNNING") pipelineRun.fail();
    });

    return pipelineRun;
  }

  getRun(runId: string): RunPipeline | undefined {
    // Retrieve the run from your Map
    return this.runs.get(runId);
  }
}

export default PipelineEngine;
