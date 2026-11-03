import type { Workflow, PipelineStatus } from "../workflow/workflow.js";
import RunPipeline from "../pipeline/pipeline-run.js";
import { executeJob } from "./job-executor.js";
import { getReadyJobs, skipBlockedJobs } from "./job-scheduler.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";
import { JobQueue } from "./job-queue.js";
import { enqueueReadyJobsOnce } from "./job-dispatch.js";
import { executeQueuedJobsSettled } from "./settled-job-executor.js";

export async function runScheduler(
  workflow: Workflow,
  run: RunPipeline,
  signal?: AbortSignal,
): Promise<void> {
  const queue = new JobQueue();
  const scheduled = new Set<string>();
  const limiter = new ConcurrencyLimiter(2);

  while (true) {
    if ((run.status as PipelineStatus) === "CANCELLED" || signal?.aborted) {
      for (const job of Object.values(run.jobs)) {
        if (job.status === "QUEUED") {
          job.status = "CANCELLED";
          job.failureReason = "Run was cancelled";
        }
      }
      return;
    }

    const skippedJobs = await skipBlockedJobs(workflow, run);
    const readyJobs = await getReadyJobs(workflow, run);

    enqueueReadyJobsOnce(queue, scheduled, readyJobs);

    const hasUnfinishedJobs = Object.values(run.jobs).some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasUnfinishedJobs) {
      if ((run.status as PipelineStatus) === "CANCELLED") {
        return;
      }
      if (
        Object.values(run.jobs).some(
          (job) =>
            job.status === "CANCELLED" ||
            job.status === "SKIPPED" ||
            job.status === "FAILED",
        )
      ) {
        const firstFailedJob = Object.values(run.jobs).find(
          (j) => j.status === "FAILED" && j.failureReason,
        );
        const failureReason =
          run.failureReason ||
          (firstFailedJob
            ? `Job '${firstFailedJob.jobId}' failed: ${firstFailedJob.failureReason}`
            : "Pipeline failed: One or more jobs failed or were skipped");
        run.fail(failureReason);
      } else {
        run.complete();
      }
      return;
    }

    if (readyJobs.length > 0) {
      await executeQueuedJobsSettled(queue, limiter, async (jobId) => {
        try {
          await executeJob(workflow, run, jobId, signal);
        } catch (error) {
          if (run.jobs[jobId]?.status !== "FAILED") {
            throw error;
          }

          // Expected failure already recorded by executeJob.
          // Allow other independent jobs to finish.
        }
      });
    } else if (skippedJobs.length === 0) {
      const stuckJobs = Object.values(run.jobs).filter(
        (job) => job.status === "QUEUED",
      );
      const stuckJobIds = stuckJobs.map((j) => j.jobId);

      for (const job of stuckJobs) {
        job.status = "FAILED";
        job.finishedAt = new Date();
        const deps = workflow.jobs[job.jobId]?.needs ?? [];
        job.failureReason = `Cycle Detected: Job '${job.jobId}' is blocked by circular or unresolvable dependencies [${deps.join(", ")}]`;
      }

      const cycleMsg = `Cycle Detected! Dependency cycle or deadlock prevented jobs [${stuckJobIds.join(", ")}] from executing`;
      run.fail(cycleMsg);
      throw new Error(cycleMsg);
    }
  }
}
