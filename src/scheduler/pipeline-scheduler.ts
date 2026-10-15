import type { Workflow } from "../workflow/workflow.js";
import RunPipeline from "../pipeline/pipeline-run.js";
import { executeJob } from "./job-executor.js";
import { getReadyJobs, skipBlockedJobs } from "./job-scheduler.js";

export async function runScheduler(
  workflow: Workflow,
  run: RunPipeline,
): Promise<void> {
  while (true) {
    const skippedJobs = await skipBlockedJobs(workflow, run);
    const readyJobs = await getReadyJobs(workflow, run);
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

    if (readyJobs.length > 0)
      for (const readyJob of readyJobs) {
        const job = run.jobs?.[readyJob];
        const jobId = job?.jobId;

        if (!job) continue;

        if (!jobId) continue;

        try {
          await executeJob(workflow, run, jobId);
        } catch (error) {
          // executeJob already marks execution failures as FAILED.
          if (run.jobs[jobId]?.status !== "FAILED") {
            throw error;
          }

          // Expected job failure.
          // Let the scheduler continue processing job statuses.
        }
      }
    else if (skippedJobs.length === 0) {
      throw new Error("Cycle Detected!");
    }
  }
}
