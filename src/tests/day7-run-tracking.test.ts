import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-run-tracking.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

async function waitForStatus(
  engine: PipelineEngine,
  runId: string,
  expected: "SUCCESS" | "FAILED",
): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const current = engine.getRun(runId);

    if (current?.status === expected) {
      return;
    }

    if (current?.status === "SUCCESS" || current?.status === "FAILED") {
      throw new Error(`Expected ${expected}, received ${current.status}`);
    }

    await sleep(25);
  }

  throw new Error(`Timed out waiting for run ${runId}: ${expected}`);
}

const engine = new PipelineEngine(workflow);

// TEST 1 — run() starts asynchronously
const first = await engine.run();

assert.ok(first.id);
assert.equal(first.status, "RUNNING");

console.log("Test 1 passed: run() returns while pipeline is running");

// TEST 2 — Engine preserves run identity
assert.strictEqual(engine.getRun(first.id), first);

assert.equal(engine.getRun("unknown-run-id"), undefined);

console.log("Test 2 passed: Run identity preserved");

// TEST 3 — Active runs are tracked
assert.equal(engine.getActiveRunCount(), 1);

assert.equal(engine.getMetricsSnapshot().totalRuns, 0);

console.log("Test 3 passed: Active run tracked separately");

// TEST 4 — Independent runs can execute concurrently
const second = await engine.run();

assert.notEqual(first.id, second.id);

assert.strictEqual(engine.getRun(second.id), second);

assert.equal(engine.getActiveRunCount(), 2);

console.log("Test 4 passed: Concurrent runs tracked independently");

// TEST 5 — Both runs eventually succeed
await Promise.all([
  waitForStatus(engine, first.id, "SUCCESS"),
  waitForStatus(engine, second.id, "SUCCESS"),
]);

assert.equal(engine.getActiveRunCount(), 0);

const successfulMetrics = engine.getMetricsSnapshot();

assert.equal(successfulMetrics.totalRuns, 2);
assert.equal(successfulMetrics.successfulRuns, 2);
assert.equal(successfulMetrics.failedRuns, 0);

console.log("Test 5 passed: Completion updates runs and metrics");

// TEST 6 — Failed pipeline remains trackable
const failureWorkflow: Workflow = {
  ...workflow,
  name: "day7-run-tracking-failure",
  webhook: {
    ...workflow.webhook,
    url: "/webhooks/day7-run-tracking-failure",
  },
  jobs: {
    build: {
      steps: [
        {
          name: "Fail Build",
          run: "sleep 0.2; exit 1",
        },
      ],
    },
  },
};

const failedEngine = new PipelineEngine(failureWorkflow);

const failedRun = await failedEngine.run();

assert.equal(failedRun.status, "RUNNING");

await waitForStatus(failedEngine, failedRun.id, "FAILED");

const internal = failedEngine as unknown as {
  completionPromises: Map<string, Promise<void>>;
};

const completion = internal.completionPromises.get(failedRun.id);

assert.ok(completion, "Completion Promise must exist");

await completion;

// Now finalization is complete.
assert.strictEqual(failedEngine.getRun(failedRun.id), failedRun);

assert.equal(failedEngine.getActiveRunCount(), 0);

const failedMetrics = failedEngine.getMetricsSnapshot();

assert.equal(failedMetrics.totalRuns, 1);
assert.equal(failedMetrics.failedRuns, 1);
assert.equal(failedMetrics.successfulRuns, 0);

console.log("Test 6 passed: Failed pipeline remains trackable");

console.log("ALL DAY 7 PIPELINE RUN TRACKING TESTS PASSED!");
