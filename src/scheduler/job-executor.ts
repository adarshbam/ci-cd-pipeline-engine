import {
  restoreArtifact,
  saveArtifact,
} from "../artifacts/artifact-manager.js";
import { resolveWorkspaceArtifactPath } from "../artifacts/artifact-path.js";
import { executeStepsInExistingWorkspace } from "../runner/job-runner.js";
import { withWorkspace } from "../runner/workspace.js";
import type { Workflow, PipelineRun } from "../workflow/workflow.js";

export async function executeJob(
  workflow: Workflow,
  run: PipelineRun,
  jobId: string,
): Promise<void> {
  // Your implementation
  const jobConfig = workflow.jobs[jobId];
  const jobRun = run.jobs[jobId];

  if (!jobConfig || !jobRun) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (jobRun.status !== "QUEUED") {
    throw new Error(`Job ${jobId} is not QUEUED`);
  }

  const runBranch = run.branch;
  const runEnvironment = run.environment;

  // Continue with execution here

  jobRun.status = "RUNNING";
  if (runBranch !== undefined) jobRun.branch = runBranch;
  if (runEnvironment !== undefined) jobRun.environment = runEnvironment;

  try {
    const downloads = jobConfig.artifacts?.download ?? [];
    const uploads = jobConfig.artifacts?.upload ?? [];

    const stepsExecutionResult = await withWorkspace(async (workspacePath) => {
      for (const download of downloads) {
        const dependencies = jobConfig.needs ?? [];

        if (!dependencies.includes(download.fromJob))
          throw new Error("Using Artifact but doesn't depend on it");

        const producer = run.jobs[download.fromJob];
        if (producer?.status !== "SUCCESS") {
          throw new Error(
            `Cannot download artifact: job ${download.fromJob} has not succeeded`,
          );
        }

        const resolvedPath = resolveWorkspaceArtifactPath(
          workspacePath,
          download.path,
        );

        await restoreArtifact(
          run.id,
          download.fromJob,
          download.name,
          resolvedPath,
        );
      }

      const stepsExecutionResult = await executeStepsInExistingWorkspace(
        jobConfig.steps,
        workspacePath,
      );

      if (
        stepsExecutionResult.some(
          (stepResult) => stepResult.status === "FAILED",
        )
      ) {
        return stepsExecutionResult;
      }

      for (const upload of uploads) {
        const resolvedPath = resolveWorkspaceArtifactPath(
          workspacePath,
          upload.path,
        );

        await saveArtifact(run.id, jobId, upload.name, resolvedPath);
      }

      return stepsExecutionResult;
    });

    if (
      stepsExecutionResult.some((stepResult) => stepResult.status === "FAILED")
    ) {
      jobRun.status = "FAILED";
    } else {
      jobRun.status = "SUCCESS";
    }
  } catch (err) {
    jobRun.status = "FAILED";
    throw err;
  }
}
