import assert from "node:assert/strict";
import RunPipeline from "../pipeline/pipeline-run.js";
import { runScheduler } from "../scheduler/pipeline-scheduler.js";
import type { Workflow } from "../workflow/workflow.js";

// ============================================
// TEST 1: Successful pipeline
// ============================================

const successWorkflow = {
  name: "pipeline-success",
  webhook: { url: "/test-success" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Build", run: "echo build" }],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Test", run: "echo test" }],
    },
    deploy: {
      needs: ["test"],
      steps: [{ name: "Deploy", run: "echo deploy" }],
    },
  },
} as Workflow;

const successRun = new RunPipeline(successWorkflow);

successRun.start();
await runScheduler(successWorkflow, successRun);

// All jobs must succeed.
assert.equal(successRun.jobs.build?.status, "SUCCESS");
assert.equal(successRun.jobs.test?.status, "SUCCESS");
assert.equal(successRun.jobs.deploy?.status, "SUCCESS");

// Pipeline must be finalized.
assert.equal(successRun.status, "SUCCESS");

const successFinishedAt: unknown = successRun.finishedAt;
assert.ok(successFinishedAt instanceof Date);

console.log("Test 1 passed: Successful pipeline");

// ============================================
// TEST 2: Failed job propagates failure
// ============================================

const failedWorkflow = {
  name: "pipeline-failure",
  webhook: { url: "/test-failure" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Build", run: "exit 1" }],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Test", run: "echo test" }],
    },
    deploy: {
      needs: ["test"],
      steps: [{ name: "Deploy", run: "echo deploy" }],
    },
  },
} as Workflow;

const failedRun = new RunPipeline(failedWorkflow);

failedRun.start();
await runScheduler(failedWorkflow, failedRun);

// Failed job must be detected.
assert.equal(failedRun.jobs.build?.status, "FAILED");

// Dependent jobs must be skipped.
assert.equal(failedRun.jobs.test?.status, "SKIPPED");
assert.equal(failedRun.jobs.deploy?.status, "SKIPPED");

// Entire pipeline must fail.
assert.equal(failedRun.status, "FAILED");

const failedFinishedAt: unknown = failedRun.finishedAt;
assert.ok(failedFinishedAt instanceof Date);

console.log("Test 2 passed: Failed pipeline");

// ============================================
// TEST 3: No unfinished jobs remain
// ============================================

const terminalStatuses = new Set(["SUCCESS", "FAILED", "SKIPPED", "CANCELLED"]);

for (const pipeline of [successRun, failedRun]) {
  for (const job of Object.values(pipeline.jobs)) {
    assert.ok(
      terminalStatuses.has(job.status),
      `Job ${job.jobId} is still ${job.status}`,
    );
  }
}

console.log("Test 3 passed: All jobs finalized");
console.log("All PipelineFinalization tests passed!");
