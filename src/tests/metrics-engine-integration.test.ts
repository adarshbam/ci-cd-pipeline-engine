import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const slowWorkflow = {
  name: "metrics-success",
  webhook: { url: "/test/metrics-success" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [
        {
          name: "Wait",
          run: 'node -e "setTimeout(() => {}, 400)"',
        },
      ],
    },
  },
} as Workflow;

const failedWorkflow = {
  name: "metrics-failure",
  webhook: { url: "/test/metrics-failure" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Fail", run: "exit 1" }],
    },
  },
} as Workflow;

const runIds: string[] = [];

async function waitForMetrics(
  engine: PipelineEngine,
  expectedCompleted: number,
): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (
      engine.getMetricsSnapshot().totalRuns === expectedCompleted &&
      engine.getActiveRunCount() === 0
    ) {
      return;
    }

    await sleep(25);
  }

  throw new Error("Metrics did not update in time");
}

try {
  // TEST 1 — Fresh engine starts with empty metrics
  const successEngine = new PipelineEngine(slowWorkflow);

  assert.deepEqual(successEngine.getMetricsSnapshot(), {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageDurationMs: 0,
  });

  assert.equal(successEngine.getActiveRunCount(), 0);

  console.log("Test 1 passed: Initial metrics empty");

  // TEST 2 — Starting pipeline registers active run
  const firstRun = await successEngine.run();
  runIds.push(firstRun.id);

  assert.equal(successEngine.getActiveRunCount(), 1);
  assert.equal(successEngine.getMetricsSnapshot().totalRuns, 0);

  console.log("Test 2 passed: Active pipeline tracked");

  // TEST 3 — Successful execution records final metrics
  await waitForMetrics(successEngine, 1);

  assert.equal(firstRun.status, "SUCCESS");

  const firstSnapshot = successEngine.getMetricsSnapshot();

  assert.equal(firstSnapshot.totalRuns, 1);
  assert.equal(firstSnapshot.successfulRuns, 1);
  assert.equal(firstSnapshot.failedRuns, 0);

  assert.ok(Number.isFinite(firstSnapshot.averageDurationMs));

  assert.ok(firstSnapshot.averageDurationMs >= 0);
  assert.equal(successEngine.getActiveRunCount(), 0);

  console.log("Test 3 passed: Success metrics recorded");

  // TEST 4 — Failed execution records failure metrics
  const failureEngine = new PipelineEngine(failedWorkflow);

  const failedRun = await failureEngine.run();
  runIds.push(failedRun.id);

  await waitForMetrics(failureEngine, 1);

  assert.equal(failedRun.status, "FAILED");

  assert.deepEqual(
    {
      totalRuns: failureEngine.getMetricsSnapshot().totalRuns,
      successfulRuns: failureEngine.getMetricsSnapshot().successfulRuns,
      failedRuns: failureEngine.getMetricsSnapshot().failedRuns,
    },
    {
      totalRuns: 1,
      successfulRuns: 0,
      failedRuns: 1,
    },
  );

  console.log("Test 4 passed: Failure metrics recorded");

  // TEST 5 — Multiple executions accumulate metrics
  const secondRun = await successEngine.run();
  runIds.push(secondRun.id);

  await waitForMetrics(successEngine, 2);

  assert.equal(secondRun.status, "SUCCESS");

  const secondSnapshot = successEngine.getMetricsSnapshot();

  assert.equal(secondSnapshot.totalRuns, 2);
  assert.equal(secondSnapshot.successfulRuns, 2);
  assert.equal(secondSnapshot.failedRuns, 0);
  assert.equal(successEngine.getActiveRunCount(), 0);

  console.log("Test 5 passed: Multiple runs counted correctly");

  // TEST 6 — Engines keep independent metrics
  assert.equal(successEngine.getMetricsSnapshot().totalRuns, 2);

  assert.equal(failureEngine.getMetricsSnapshot().totalRuns, 1);

  assert.equal(successEngine.getMetricsSnapshot().failedRuns, 0);

  assert.equal(failureEngine.getMetricsSnapshot().failedRuns, 1);

  console.log("Test 6 passed: Engine metrics isolated");

  console.log("All Metrics Engine Integration tests passed!");
} finally {
  for (const runId of runIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
