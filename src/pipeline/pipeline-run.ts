import type {
  Environment,
  JobRun,
  PipelineRun,
  PipelineStatus,
  Workflow,
} from "../workflow/workflow.js";

import { randomUUID } from "node:crypto";

export default class RunPipeline implements PipelineRun {
  id: string;
  pipelineId: string;
  jobs: Record<string, JobRun>;
  createdAt: Date;
  status: PipelineStatus;
  workflow: Workflow;
  startedAt?: Date;
  finishedAt?: Date;
  branch?: string;
  environment?: Environment;

  constructor(workflow: Workflow, branch?: string, environment?: Environment) {
    this.id = randomUUID();
    this.pipelineId = workflow.name;
    this.workflow = workflow;
    this.status = "QUEUED";
    this.createdAt = new Date();
    this.jobs = {};

    if (branch !== undefined) {
      this.branch = branch;
    }

    if (environment !== undefined) {
      this.environment = environment;
    }
    for (const jobId of Object.keys(workflow.jobs)) {
      this.jobs[jobId] = {
        jobId,
        status: "QUEUED",
      };
    }
  }

  start() {
    if (this.status === "QUEUED") {
      this.status = "RUNNING";
      this.startedAt = new Date();
    } else {
      throw new Error("Starting this Pipeline Run because it's not QUEUED");
    }
  }

  complete() {
    if (this.status === "CANCELLED") {
      return;
    }
    if (this.status === "RUNNING") {
      this.status = "SUCCESS";
      this.finishedAt = new Date();
    } else {
      throw new Error("Only running pipeline can complete running");
    }
  }

  fail() {
    if (this.status === "CANCELLED") {
      return;
    }
    if (this.status === "RUNNING") {
      this.status = "FAILED";
      this.finishedAt = new Date();
    } else {
      throw new Error("Only running pipeline can complete running");
    }
  }

  cancel(reason = "Cancelled by user") {
    if (this.status === "SUCCESS" || this.status === "FAILED") {
      return;
    }
    this.status = "CANCELLED";
    this.finishedAt = new Date();
    for (const job of Object.values(this.jobs)) {
      if (job.status === "QUEUED") {
        job.status = "CANCELLED";
        job.failureReason = reason;
      }
    }
  }

  static fromStored(stored: any): RunPipeline {
    const run = new RunPipeline(
      stored.workflow,
      stored.branch,
      stored.environment,
    );
    run.id = stored.id;
    run.pipelineId = stored.pipelineId;
    run.status = stored.status;
    run.createdAt = new Date(stored.createdAt);
    if (stored.startedAt) {
      run.startedAt = new Date(stored.startedAt);
    }
    if (stored.finishedAt) {
      run.finishedAt = new Date(stored.finishedAt);
    }
    run.jobs = stored.jobs || {};
    return run;
  }
}
