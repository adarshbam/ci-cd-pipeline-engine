import { executeStepsInWorkspace } from "../runner/job-runner.js";
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

  // Continue with execution here

  jobRun.status = "RUNNING";

  try {
    const stepsExecutionResult = await executeStepsInWorkspace(jobConfig.steps);

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
