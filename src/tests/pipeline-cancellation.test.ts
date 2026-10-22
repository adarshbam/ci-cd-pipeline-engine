import assert from "node:assert/strict";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import RunPipeline from "../pipeline/pipeline-run.js";
import type { Workflow } from "../workflow/workflow.js";
import { setTimeout as sleep } from "node:timers/promises";

// ============================================
// TEST 1: RunPipeline unit cancel behavior
// ============================================
{
  const workflow: Workflow = {
    name: "test-cancellation",
    webhook: { url: "/test-cancel" },
    trigger: { events: ["push"] },
    jobs: {
      build: { steps: [{ name: "Build", run: "echo ok" }] },
      deploy: { needs: ["build"], steps: [{ name: "Deploy", run: "echo ok" }] },
    },
  };

  const run = new RunPipeline(workflow);
  assert.equal(run.status, "QUEUED");
  assert.equal(run.jobs.build?.status, "QUEUED");
  assert.equal(run.jobs.deploy?.status, "QUEUED");

  run.cancel("User aborted run");
  assert.equal(run.status, "CANCELLED");
  assert.equal(run.jobs.build?.status, "CANCELLED");
  assert.equal(run.jobs.deploy?.status, "CANCELLED");
  assert.ok(run.finishedAt instanceof Date);

  // Calling complete() or fail() on cancelled run must not overwrite CANCELLED
  run.complete();
  assert.equal(run.status, "CANCELLED");

  run.fail();
  assert.equal(run.status, "CANCELLED");

  console.log("Test 1 passed: RunPipeline.cancel() semantics verified");
}

// ============================================
// TEST 2: PipelineEngine cancellation of running long job
// ============================================
{
  const longWorkflow: Workflow = {
    name: "test-long-cancel",
    webhook: { url: "/test-long-cancel" },
    trigger: { events: ["push"] },
    jobs: {
      step1: {
        steps: [
          {
            name: "Long Step",
            run: "node -e \"setTimeout(() => {}, 5000)\"",
          },
        ],
      },
      step2: {
        needs: ["step1"],
        steps: [
          {
            name: "Downstream Step",
            run: "echo downstream",
          },
        ],
      },
    },
  };

  const engine = new PipelineEngine(longWorkflow);
  const run = await engine.run();

  assert.equal(run.status, "RUNNING");
  assert.equal(engine.getActiveRunCount(), 1);

  // Give step1 time to spawn
  await sleep(200);

  // Trigger cancellation
  const cancelled = await engine.cancelRun(run.id);
  assert.equal(cancelled, true);

  // Wait a moment for process killing and state update
  await sleep(300);

  assert.equal(run.status, "CANCELLED");
  assert.equal(run.jobs.step1?.status, "CANCELLED");
  assert.equal(run.jobs.step2?.status, "CANCELLED");

  // Active run count should decrement
  assert.equal(engine.getActiveRunCount(), 0);

  // Idempotent cancel
  const cancelledAgain = await engine.cancelRun(run.id);
  assert.equal(cancelledAgain, true);

  console.log("Test 2 passed: Running child process terminated and state marked CANCELLED");
}

console.log("All Pipeline Cancellation tests passed!");
