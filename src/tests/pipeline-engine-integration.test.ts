import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

async function waitForTerminal(
  engine: PipelineEngine,
  runId: string,
  timeoutMs = 10000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const run = engine.getRun(runId);

    if (run && (run.status === "SUCCESS" || run.status === "FAILED")) {
      return run;
    }

    await delay(50);
  }

  throw new Error(`Pipeline ${runId} did not finish within ${timeoutMs}ms`);
}

// TEST 1: Successful end-to-end pipeline

const successWorkflow = {
  name: "engine-integration-success",
  webhook: { url: "/test-success" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Build", run: "sleep 0.5; echo build" }],
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

const engine = new PipelineEngine(successWorkflow);

const run1 = await engine.run();

assert.equal(run1.status, "RUNNING");
assert.strictEqual(engine.getRun(run1.id), run1);

const completed = await waitForTerminal(engine, run1.id);

assert.equal(completed.status, "SUCCESS");
assert.equal(completed.jobs.build?.status, "SUCCESS");
assert.equal(completed.jobs.test?.status, "SUCCESS");
assert.equal(completed.jobs.deploy?.status, "SUCCESS");

const completedAt: unknown = completed.finishedAt;
assert.ok(completedAt instanceof Date);

console.log("Test 1 passed: Engine completes pipeline");

// TEST 2: Failure propagates automatically

const failedWorkflow = {
  name: "engine-integration-failure",
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

const failedEngine = new PipelineEngine(failedWorkflow);

const run2 = await failedEngine.run();

const failed = await waitForTerminal(failedEngine, run2.id);

assert.equal(failed.status, "FAILED");
assert.equal(failed.jobs.build?.status, "FAILED");
assert.equal(failed.jobs.test?.status, "SKIPPED");
assert.equal(failed.jobs.deploy?.status, "SKIPPED");

const failedAt: unknown = failed.finishedAt;
assert.ok(failedAt instanceof Date);

console.log("Test 2 passed: Engine propagates failure");

// TEST 3: Independent runs remain retrievable

const run3 = await engine.run();

assert.notEqual(run1.id, run3.id);
assert.strictEqual(engine.getRun(run1.id), run1);
assert.strictEqual(engine.getRun(run3.id), run3);

const completed3 = await waitForTerminal(engine, run3.id);

assert.equal(completed3.status, "SUCCESS");
assert.equal(completed.status, "SUCCESS");

console.log("Test 3 passed: Independent runs tracked");

console.log("All PipelineEngine integration tests passed!");
