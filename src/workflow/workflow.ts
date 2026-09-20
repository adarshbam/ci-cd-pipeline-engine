export interface Workflow {
  name: string;

  webhook: {
    url: string;
  };

  trigger: {
    events: string[];
    branches?: Record<string, string>;
  };

  jobs: Record<string, Job>;
}

export interface Job {
  steps: Step[];
  needs?: string[];
}

interface BaseStep {
  name: string;
}

interface CommandStep extends BaseStep {
  run: string;
}

interface ScriptStep extends BaseStep {
  script: string;
}

type Step = CommandStep | ScriptStep;

export type PipelineStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export interface PipelineRun {
  id: string;
  pipelineId: string;
  jobs: Record<string, JobRun>;
  workflow: Workflow;
  status: PipelineStatus;
  createdAt: String;
}

interface JobRun {
  jobId: string;
  runnerId?: string;
  status: PipelineStatus;
}
