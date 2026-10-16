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

export interface ArtifactUpload {
  name: string;
  path: string;
}

export interface ArtifactDownload {
  fromJob: string;
  name: string;
  path: string;
}

export interface Job {
  steps: Step[];
  needs?: string[];
  artifacts?: {
    upload?: ArtifactUpload[];
    download?: ArtifactDownload[];
  };
}

interface BaseStep {
  name: string;
  timeoutMs?: number;
  retries?: number;
}

interface CommandStep extends BaseStep {
  run: string;
}

interface ScriptStep extends BaseStep {
  script: string;
}

export type Step = CommandStep | ScriptStep;

export type PipelineStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export type Environment = "TEST" | "PROD";

export interface PipelineRun {
  id: string;
  pipelineId: string;
  jobs: Record<string, JobRun>;
  workflow: Workflow;
  status: PipelineStatus;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  branch?: string;
  environment?: Environment;
}

export interface JobRun {
  jobId: string;
  runnerId?: string;
  status: PipelineStatus;
  branch?: string;
  environment?: Environment;
}
