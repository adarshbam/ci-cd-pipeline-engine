import type { Workflow } from "../workflow/workflow.js";
import RunPipeline from "./pipeline-run.js";

class PipelineEngine {
  private workflow: Workflow;
  private runs = new Map<string, RunPipeline>();

  constructor(workflow: Workflow) {
    this.workflow = workflow;
  }

  async run(): Promise<RunPipeline> {
    const pipelineRun = new RunPipeline(this.workflow);

    pipelineRun.start();
    this.runs.set(pipelineRun.id, pipelineRun);

    return pipelineRun;
  }

  getRun(runId: string): RunPipeline | undefined {
    // Retrieve the run from your Map
    return this.runs.get(runId);
  }
}

export default PipelineEngine;
