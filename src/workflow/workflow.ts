import type { RollbackResult } from "../rollback/rollback-executor.js";
import type { StepExecutionResult } from "../types/step-result.js";

export interface Workflow {
  name: string;

  environments?: {
    test?: EnvironmentConfig;
    prod?: EnvironmentConfig;
  };

  webhook: {
    url: string;
    methods?: ("GET" | "POST")[];
  };

  trigger: {
    events: string[];
    branches?: Record<string, string>;
    allowedBranches?: string[];
    allowedRepositories?: string[];
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
  healthCheck?: boolean;
  rollback?: RollbackConfig;
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

export interface EnvironmentConfig {
  envFile?: string;
  healthUrl?: string;
}

export interface StepExecutionDetail extends StepExecutionResult {
  name: string;
}

export interface CommitStatusInfo {
  state: "pending" | "success" | "failure" | "unavailable";
  context: string;
  description: string;
  reportedAt?: string;
  updatedAt?: string;
  commitUrl?: string;
  url?: string;
  targetUrl?: string;
  error?: string;
}

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
  commitSha?: string;
  repository?: string;
  deliveryId?: string;
  commitStatus?: CommitStatusInfo;
}

export interface JobRun {
  jobId: string;
  runnerId?: string;
  status: PipelineStatus;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  exitCode?: number | null;
  branch?: string;
  environment?: Environment;
  failureReason?: string;
  rollbackResult?: RollbackResult;
  stepResults?: StepExecutionDetail[];
}

export interface RollbackConfig {
  steps: Step[];
}
