import type { Workflow, PipelineRun } from "../workflow/workflow.js";

export function getReadyJobs(workflow: Workflow, run: PipelineRun): string[] {
  const eligibleJobs: string[] = [];

  for (const [jobId, jobConfig] of Object.entries(workflow.jobs)) {
    if (run.jobs[jobId]?.status === "QUEUED") {
      const dependencies = jobConfig.needs ?? [];

      if (
        dependencies.every(
          (dependencyId) => run.jobs[dependencyId]?.status === "SUCCESS",
        )
      ) {
        eligibleJobs.push(jobId);
      }
    }
  }

  return eligibleJobs;
}

export function skipBlockedJobs(
  workflow: Workflow,
  run: PipelineRun,
): string[] {
  // Your implementation

  const skippedJobs: string[] = [];

  let change = true;
  while (change) {
    change = false;
    for (const [jobId, jobConfig] of Object.entries(workflow.jobs)) {
      if (run.jobs[jobId]?.status === "QUEUED") {
        const dependencies = jobConfig.needs ?? [];

        if (
          dependencies.some(
            (dependencyId) =>
              run.jobs[dependencyId]?.status === "CANCELLED" ||
              run.jobs[dependencyId]?.status === "FAILED" ||
              run.jobs[dependencyId]?.status === "SKIPPED",
          )
        ) {
          run.jobs[jobId].status = "SKIPPED";
          skippedJobs.push(jobId);
          change = true;
        }
      }
    }
  }

  return skippedJobs;
}
