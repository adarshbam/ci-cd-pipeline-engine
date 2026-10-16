import type { Workflow } from "../workflow/workflow.js";
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
): Promise<void> {
  const queue = new JobQueue();
  const scheduled = new Set<string>();
  const limiter = new ConcurrencyLimiter(2);

  while (true) {
    const skippedJobs = await skipBlockedJobs(workflow, run);
    const readyJobs = await getReadyJobs(workflow, run);

    enqueueReadyJobsOnce(queue, scheduled, readyJobs);

    const hasUnfinishedJobs = Object.values(run.jobs).some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasUnfinishedJobs) {
      if (
        Object.values(run.jobs).some(
          (job) =>
            job.status === "CANCELLED" ||
            job.status === "SKIPPED" ||
            job.status === "FAILED",
        )
      ) {
        run.fail();
      } else {
        run.complete();
      }
      return;
    }

    if (readyJobs.length > 0) {
      await executeQueuedJobsSettled(queue, limiter, async (jobId) => {
        try {
          await executeJob(workflow, run, jobId);
        } catch (error) {
          if (run.jobs[jobId]?.status !== "FAILED") {
            throw error;
          }

          // Expected failure already recorded by executeJob.
          // Allow other independent jobs to finish.
        }
      });
    } else if (skippedJobs.length === 0) {
      throw new Error("Cycle Detected!");
    }
  }
}
