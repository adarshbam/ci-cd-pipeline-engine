import type { Workflow } from "../workflow/workflow.js";
import RunPipeline from "./pipeline-run.js";

class pipeline {
  constructor(workflow: Workflow) {
    private workflow = this.workflow;
  }

  async run() {
    const PipelineRunner = new RunPipeline(workflow)
  }
}
