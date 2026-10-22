import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-run-tracking.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

// Test-only access to the completion Map.
// We won't use this approach in production.
function getCompletionPromise(
  engine: PipelineEngine,
  runId: string,
): Promise<void> {
  const internal = engine as unknown as {
    completionPromises: Map<string, Promise<void>>;
  };

  assert.ok(
    internal.completionPromises instanceof Map,
    "PipelineEngine must contain a completionPromises Map",
  );

  const promise = internal.completionPromises.get(runId);

  assert.ok(
    promise instanceof Promise,
    `No completion Promise stored for run ${runId}`,
  );

  return promise;
}

// Prevent a broken Promise from hanging the test forever.
async function withTimeout(
  promise: Promise<void>,
  label: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      promise,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timed out: ${label}`));
        }, 20_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

// TEST 1 — Pipeline stores its completion Promise
{
  const engine = new PipelineEngine(workflow);

  const run = await engine.run();

  assert.equal(run.status, "RUNNING");

  const completion = getCompletionPromise(engine, run.id);

  assert.ok(completion instanceof Promise);

  console.log("Test 1 passed: Completion Promise stored");

  // TEST 2 — Promise tracks actual execution
  assert.equal(engine.getActiveRunCount(), 1);

  await withTimeout(completion, "First pipeline");

  assert.equal(run.status, "SUCCESS");

  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 2 passed: Promise tracks execution completion");

  // TEST 3 — Metrics completed before Promise settles
  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 1);
  assert.equal(metrics.successfulRuns, 1);
  assert.equal(metrics.failedRuns, 0);

  console.log("Test 3 passed: Metrics finalized before settlement");

  // TEST 4 — Promise remains accessible after completion
  assert.strictEqual(getCompletionPromise(engine, run.id), completion);

  await withTimeout(
    getCompletionPromise(engine, run.id),
    "Already completed pipeline",
  );

  console.log("Test 4 passed: Completed Promise remains accessible");
}

// TEST 5 — Concurrent runs have independent Promises
{
  const engine = new PipelineEngine(workflow);

  const first = await engine.run();
  const second = await engine.run();

  assert.notEqual(first.id, second.id);

  const firstCompletion = getCompletionPromise(engine, first.id);

  const secondCompletion = getCompletionPromise(engine, second.id);

  assert.notStrictEqual(firstCompletion, secondCompletion);

  await withTimeout(
    Promise.all([firstCompletion, secondCompletion]).then(() => undefined),
    "Concurrent pipelines",
  );

  assert.equal(first.status, "SUCCESS");
  assert.equal(second.status, "SUCCESS");

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 2);
  assert.equal(metrics.successfulRuns, 2);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 5 passed: Concurrent completion Promises isolated");
}

// TEST 6 — Normal job failure settles its Promise
{
  const failedWorkflow: Workflow = {
    ...workflow,
    name: "day7-completion-failure",
    jobs: {
      build: {
        steps: [
          {
            name: "Intentional Failure",
            run: "exit 1",
          },
        ],
      },
    },
  };

  const engine = new PipelineEngine(failedWorkflow);

  const run = await engine.run();

  await withTimeout(getCompletionPromise(engine, run.id), "Failed pipeline");

  assert.equal(run.status, "FAILED");

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 1);
  assert.equal(metrics.failedRuns, 1);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 6 passed: Failed pipeline Promise settled");
}

// TEST 7 — Scheduler exception also settles Promise
{
  const cyclicWorkflow: Workflow = {
    ...workflow,
    name: "day7-completion-cycle",
    jobs: {
      alpha: {
        needs: ["beta"],
        steps: [
          {
            name: "Alpha",
            run: "echo alpha",
          },
        ],
      },
      beta: {
        needs: ["alpha"],
        steps: [
          {
            name: "Beta",
            run: "echo beta",
          },
        ],
      },
    },
  };

  const engine = new PipelineEngine(cyclicWorkflow);

  const run = await engine.run();

  await withTimeout(getCompletionPromise(engine, run.id), "Cyclic pipeline");

  assert.equal(run.status, "FAILED");

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.failedRuns, 1);
  assert.equal(metrics.totalRuns, 1);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 7 passed: Scheduler exception settles Promise");
}

console.log("ALL DAY 7 COMPLETION PROMISE TESTS PASSED!");
