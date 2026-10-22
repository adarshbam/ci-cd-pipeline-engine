import {
  restoreArtifact,
  saveArtifact,
} from "../artifacts/artifact-manager.js";
import { resolveWorkspaceArtifactPath } from "../artifacts/artifact-path.js";
import { checkEnvironmentHealth } from "../health/environment-health.js";
import { createLogEntry } from "../logging/log-entry.js";
import { appendLogEntry } from "../logging/log-store.js";
import { executeRollbackSteps } from "../rollback/rollback-steps.js";
import { executeStepsInExistingWorkspace } from "../runner/job-runner.js";
import { withWorkspace } from "../runner/workspace.js";
import type {
  Workflow,
  PipelineRun,
  PipelineStatus,
} from "../workflow/workflow.js";

export async function executeJob(
  workflow: Workflow,
  run: PipelineRun,
  jobId: string,
  signal?: AbortSignal,
): Promise<void> {
  const jobConfig = workflow.jobs[jobId];
  const jobRun = run.jobs[jobId];

  if (!jobConfig || !jobRun) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (
    (run.status as PipelineStatus) === "CANCELLED" ||
    signal?.aborted
  ) {
    jobRun.status = "CANCELLED";
    jobRun.failureReason = "Run was cancelled";
    return;
  }

  if (jobRun.status !== "QUEUED") {
    throw new Error(`Job ${jobId} is not QUEUED`);
  }

  const runBranch = run.branch;
  const runEnvironment = run.environment;

  jobRun.status = "RUNNING";
  jobRun.startedAt = new Date();

  await appendLogEntry(
    createLogEntry({
      runId: run.id,
      jobId,
      level: "INFO",
      message: "Job started",
    }),
  );
  if (runBranch !== undefined) jobRun.branch = runBranch;
  if (runEnvironment !== undefined) jobRun.environment = runEnvironment;

  try {
    const downloads = jobConfig.artifacts?.download ?? [];
    const uploads = jobConfig.artifacts?.upload ?? [];

    const stepsExecutionResult = await withWorkspace(async (workspacePath) => {
      for (const download of downloads) {
        if (
          (run.status as PipelineStatus) === "CANCELLED" ||
          signal?.aborted
        ) {
          return [];
        }

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

      const results = await executeStepsInExistingWorkspace(
        jobConfig.steps,
        workspacePath,
        signal,
      );

      if (results.some((stepResult) => stepResult.status === "FAILED")) {
        return results;
      }

      if (
        (run.status as PipelineStatus) === "CANCELLED" ||
        signal?.aborted
      ) {
        return results;
      }

      for (const upload of uploads) {
        const resolvedPath = resolveWorkspaceArtifactPath(
          workspacePath,
          upload.path,
        );

        await saveArtifact(run.id, jobId, upload.name, resolvedPath);
      }

      return results;
    });

    jobRun.finishedAt = new Date();
    jobRun.durationMs =
      jobRun.finishedAt.getTime() - jobRun.startedAt.getTime();

    jobRun.stepResults = stepsExecutionResult.map((res, idx) => ({
      ...res,
      name: jobConfig.steps[idx]?.name || `Step ${idx + 1}`,
    }));

    if (
      (run.status as PipelineStatus) === "CANCELLED" ||
      signal?.aborted ||
      stepsExecutionResult.some((s) => s.status === "CANCELLED")
    ) {
      jobRun.status = "CANCELLED";
      jobRun.failureReason = "Job was cancelled";
      return;
    }

    const failedStep = stepsExecutionResult.find(
      (stepResult) => stepResult.status === "FAILED",
    );

    if (failedStep) {
      jobRun.status = "FAILED";
      jobRun.exitCode = failedStep.exitCode;

      jobRun.failureReason =
        failedStep.stderr?.trim() ||
        `Step failed with exit code ${failedStep.exitCode ?? "unknown"}`;

      await appendLogEntry(
        createLogEntry({
          runId: run.id,
          jobId,
          level: "ERROR",
          message: `Job failed: ${jobRun.failureReason}`,
        }),
      );
    } else {
      if (jobConfig.healthCheck === true) {
        await appendLogEntry(
          createLogEntry({
            runId: run.id,
            jobId,
            level: "INFO",
            message: "Health check started",
          }),
        );
        if (!run.environment) {
          throw new Error("Environment is required for health checks");
        }
        const healthCheckResult = await checkEnvironmentHealth(
          run.environment,
          workflow.environments ?? {},
        );
        if (!healthCheckResult.healthy) {
          const failureReason = `Deployment health check failed: ${
            healthCheckResult.error ??
            `HTTP ${healthCheckResult.statusCode ?? "unknown"}`
          }`;

          jobRun.failureReason = failureReason;
          await appendLogEntry(
            createLogEntry({
              runId: run.id,
              jobId,
              level: "ERROR",
              message: `Health check failed: ${failureReason}`,
            }),
          );

          if (jobConfig.rollback) {
            await appendLogEntry(
              createLogEntry({
                runId: run.id,
                jobId,
                level: "WARN",
                message: "Rollback started",
              }),
            );

            jobRun.rollbackResult = await executeRollbackSteps(
              jobConfig.rollback,
            );

            const rollbackSucceeded =
              jobRun.rollbackResult.status === "SUCCESS";

            await appendLogEntry(
              createLogEntry({
                runId: run.id,
                jobId,
                level: rollbackSucceeded ? "INFO" : "ERROR",
                message: rollbackSucceeded
                  ? "Rollback completed successfully"
                  : `Rollback failed: ${jobRun.rollbackResult.error ?? "Unknown error"}`,
              }),
            );
          }

          throw new Error(failureReason);
        }

        await appendLogEntry(
          createLogEntry({
            runId: run.id,
            jobId,
            level: "INFO",
            message: "Health check passed!",
          }),
        );
      }

      jobRun.status = "SUCCESS";
      jobRun.exitCode = 0;
      await appendLogEntry(
        createLogEntry({
          runId: run.id,
          jobId,
          level: "INFO",
          message: "Job completed successfully!",
        }),
      );
    }
  } catch (err) {
    if (
      (run.status as PipelineStatus) === "CANCELLED" ||
      signal?.aborted
    ) {
      jobRun.status = "CANCELLED";
      jobRun.failureReason = "Job was cancelled";
      return;
    }

    jobRun.status = "FAILED";

    jobRun.failureReason ??= err instanceof Error ? err.message : String(err);

    await appendLogEntry(
      createLogEntry({
        runId: run.id,
        jobId,
        level: "ERROR",
        message: `Job failed: ${jobRun.failureReason}`,
      }),
    );

    throw err;
  }
}
