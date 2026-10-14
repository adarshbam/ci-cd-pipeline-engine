import assert from "node:assert/strict";
import RunPipeline from "../pipeline/pipeline-run.js";
import { executeJob } from "../scheduler/job-executor.js";
import type { Workflow } from "../workflow/workflow.js";

function createWorkflow(command: string): Workflow {
  return {
    name: "job-execution-test",
    webhook: { url: "/test" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build step", run: command }],
      },
      test: {
        needs: ["build"],
        steps: [{ name: "Test step", run: "echo testing" }],
      },
    },
  } as Workflow;
}

// TEST 1: Successful job execution
{
  const workflow = createWorkflow("echo build-ok");
  const run = new RunPipeline(workflow);
  run.start();

  const execution = executeJob(workflow, run, "build");

  // Job should immediately transition to RUNNING.
  assert.equal(run.jobs.build?.status, "RUNNING");

  await execution;

  assert.equal(run.jobs.build?.status, "SUCCESS");

  // Other jobs must remain unchanged.
  assert.equal(run.jobs.test?.status, "QUEUED");

  // Job execution must not complete the pipeline.
  assert.equal(run.status, "RUNNING");
}

// TEST 2: Failed command
{
  const workflow = createWorkflow("exit 1");
  const run = new RunPipeline(workflow);
  run.start();

  await executeJob(workflow, run, "build");

  assert.equal(run.jobs.build?.status, "FAILED");
  assert.equal(run.jobs.test?.status, "QUEUED");

  // Pipeline finalization is handled separately.
  assert.equal(run.status, "RUNNING");
}

// TEST 3: Unknown job ID
{
  const workflow = createWorkflow("echo hello");
  const run = new RunPipeline(workflow);
  run.start();

  await assert.rejects(
    () => executeJob(workflow, run, "missing-job"),
    /not found|unknown/i,
  );
}

// TEST 4: Cannot execute completed job again
{
  const workflow = createWorkflow("echo hello");
  const run = new RunPipeline(workflow);
  run.start();

  await executeJob(workflow, run, "build");

  assert.equal(run.jobs.build?.status, "SUCCESS");

  await assert.rejects(
    () => executeJob(workflow, run, "build"),
    /QUEUED|already/i,
  );
}

console.log("All JobExecutor tests passed!");
