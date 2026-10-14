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
        if (!job) continue;

        await executeJob(workflow, run, job.jobId);
      }
    else if (skippedJobs.length === 0) {
      throw new Error("Cycle Detected!");
    }
  }
}
