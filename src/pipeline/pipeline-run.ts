import type {
  Job,
  PipelineRun,
  PipelineStatus,
  Workflow,
} from "../workflow/workflow.js";

export default class RunPipeline implements PipelineRun {
  private id: string;
  private pipelineId: string;
  private jobs: Record<string, Job>;
  private createdAt: String;
  private status: PipelineStatus;
  private workflow: Workflow;

  constructor(workflow: Workflow) {
    const workflowName: string = workflow.name;
    this.id = workflowName;
    this.workflow = workflow;
    this.status = "QUEUED";
    this.createdAt = String(Date.now());
    this.jobs = workflow.jobs;
  }
}
