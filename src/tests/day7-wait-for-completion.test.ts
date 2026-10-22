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

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// TEST 1 — Unknown run rejected
{
  const engine = new PipelineEngine(workflow);

  await assert.rejects(
    engine.waitForCompletion("unknown-run-id"),
    /Run not found/,
  );

  console.log("Test 1 passed: Unknown run rejected");
}

// TEST 2 — Waits for actual completion
{
  const engine = new PipelineEngine(workflow);

  const run = await engine.run();

  assert.equal(run.status, "RUNNING");

  const completed = await withTimeout(
    engine.waitForCompletion(run.id),
    "Successful pipeline",
  );

  assert.strictEqual(completed, run);
  assert.equal(completed.status, "SUCCESS");
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 2 passed: Waits for pipeline completion");
}

// TEST 3 — Metrics finalized before returning
{
  const engine = new PipelineEngine(workflow);

  const run = await engine.run();

  await withTimeout(engine.waitForCompletion(run.id), "Metrics finalization");

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 1);
  assert.equal(metrics.successfulRuns, 1);
  assert.equal(metrics.failedRuns, 0);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 3 passed: Metrics finalized before returning");
}

// TEST 4 — Concurrent runs remain independent
{
  const engine = new PipelineEngine(workflow);

  const first = await engine.run();
  const second = await engine.run();

  assert.notEqual(first.id, second.id);

  const [completedFirst, completedSecond] = await withTimeout(
    Promise.all([
      engine.waitForCompletion(first.id),
      engine.waitForCompletion(second.id),
    ]),
    "Concurrent pipelines",
  );

  assert.strictEqual(completedFirst, first);
  assert.strictEqual(completedSecond, second);

  assert.equal(completedFirst.status, "SUCCESS");
  assert.equal(completedSecond.status, "SUCCESS");

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 2);
  assert.equal(metrics.successfulRuns, 2);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 4 passed: Concurrent runs completed independently");
}

// TEST 5 — Failed job returns FAILED run
{
  const failedWorkflow: Workflow = {
    ...workflow,
    name: "day7-wait-failure",
    jobs: {
      build: {
        steps: [
          {
            name: "Intentional failure",
            run: "exit 1",
          },
        ],
      },
    },
  };

  const engine = new PipelineEngine(failedWorkflow);

  const run = await engine.run();

  const completed = await withTimeout(
    engine.waitForCompletion(run.id),
    "Failed pipeline",
  );

  assert.strictEqual(completed, run);
  assert.equal(completed.status, "FAILED");

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 1);
  assert.equal(metrics.failedRuns, 1);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 5 passed: Failed pipeline returned correctly");
}

// TEST 6 — Scheduler exception handled
{
  const cyclicWorkflow: Workflow = {
    ...workflow,
    name: "day7-wait-cycle",
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

  const completed = await withTimeout(
    engine.waitForCompletion(run.id),
    "Scheduler exception",
  );

  assert.strictEqual(completed, run);
  assert.equal(completed.status, "FAILED");

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 1);
  assert.equal(metrics.failedRuns, 1);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 6 passed: Scheduler exceptions handled");
}

// TEST 7 — Completed run can be awaited again
{
  const engine = new PipelineEngine(workflow);

  const run = await engine.run();

  const firstResult = await withTimeout(
    engine.waitForCompletion(run.id),
    "First wait",
  );

  const secondResult = await withTimeout(
    engine.waitForCompletion(run.id),
    "Second wait",
  );

  assert.strictEqual(firstResult, run);
  assert.strictEqual(secondResult, run);

  assert.equal(secondResult.status, "SUCCESS");

  console.log("Test 7 passed: Completed run can be awaited again");
}

console.log("ALL DAY 7 WAIT-FOR-COMPLETION TESTS PASSED!");
