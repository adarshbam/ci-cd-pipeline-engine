import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const successWorkflow = {
  name: "metrics-robust-success",
  webhook: { url: "/test/metrics-robust-success" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [
        {
          name: "Slow build",
          run: 'node -e "setTimeout(() => {}, 600)"',
        },
      ],
    },
  },
} as Workflow;

const failureWorkflow = {
  name: "metrics-robust-failure",
  webhook: { url: "/test/metrics-robust-failure" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Fail build", run: "exit 1" }],
    },
  },
} as Workflow;

const cycleWorkflow = {
  name: "metrics-robust-cycle",
  webhook: { url: "/test/metrics-robust-cycle" },
  trigger: { events: ["push"] },
  jobs: {
    first: {
      needs: ["second"],
      steps: [{ name: "First", run: "echo first" }],
    },
    second: {
      needs: ["first"],
      steps: [{ name: "Second", run: "echo second" }],
    },
  },
} as Workflow;

const createdRunIds: string[] = [];

async function waitForMetrics(
  engine: PipelineEngine,
  completed: number,
): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (
      engine.getMetricsSnapshot().totalRuns === completed &&
      engine.getActiveRunCount() === 0
    ) {
      return;
    }

    await sleep(30);
  }

  throw new Error(`Metrics did not reach ${completed} completed runs`);
}

try {
  const successEngine = new PipelineEngine(successWorkflow);
  const failureEngine = new PipelineEngine(failureWorkflow);
  const cycleEngine = new PipelineEngine(cycleWorkflow);

  // TEST 1 — Multiple concurrent pipelines
  const runs = await Promise.all([
    successEngine.run(),
    successEngine.run(),
    successEngine.run(),
  ]);

  createdRunIds.push(...runs.map((run) => run.id));

  assert.equal(new Set(runs.map((run) => run.id)).size, 3);

  assert.equal(successEngine.getActiveRunCount(), 3);

  assert.equal(successEngine.getMetricsSnapshot().totalRuns, 0);

  console.log("Test 1 passed: Concurrent pipelines tracked");

  // TEST 2 — All concurrent runs eventually finish
  await waitForMetrics(successEngine, 3);

  assert.ok(runs.every((run) => run.status === "SUCCESS"));

  const successSnapshot = successEngine.getMetricsSnapshot();

  assert.equal(successSnapshot.totalRuns, 3);
  assert.equal(successSnapshot.successfulRuns, 3);
  assert.equal(successSnapshot.failedRuns, 0);

  assert.ok(Number.isFinite(successSnapshot.averageDurationMs));

  assert.ok(successSnapshot.averageDurationMs >= 0);

  console.log("Test 2 passed: Concurrent completions recorded");

  // TEST 3 — Reading metrics never modifies them
  const before = successEngine.getMetricsSnapshot();

  for (let i = 0; i < 20; i++) {
    assert.deepEqual(successEngine.getMetricsSnapshot(), before);
  }

  assert.equal(successEngine.getActiveRunCount(), 0);

  console.log("Test 3 passed: Metrics reads are stable");

  // TEST 4 — Failed pipelines are recorded correctly
  const failedRun = await failureEngine.run();
  createdRunIds.push(failedRun.id);

  await waitForMetrics(failureEngine, 1);

  assert.equal(failedRun.status, "FAILED");

  assert.equal(failureEngine.getMetricsSnapshot().failedRuns, 1);

  assert.equal(failureEngine.getMetricsSnapshot().successfulRuns, 0);

  console.log("Test 4 passed: Failed run recorded");

  // TEST 5 — Scheduler exceptions are recorded as failures
  const cycleRun = await cycleEngine.run();
  createdRunIds.push(cycleRun.id);

  await waitForMetrics(cycleEngine, 1);

  assert.equal(cycleRun.status, "FAILED");

  assert.deepEqual(
    {
      totalRuns: cycleEngine.getMetricsSnapshot().totalRuns,
      successfulRuns: cycleEngine.getMetricsSnapshot().successfulRuns,
      failedRuns: cycleEngine.getMetricsSnapshot().failedRuns,
      activeRuns: cycleEngine.getActiveRunCount(),
    },
    {
      totalRuns: 1,
      successfulRuns: 0,
      failedRuns: 1,
      activeRuns: 0,
    },
  );

  console.log("Test 5 passed: Scheduler exception recorded");

  // TEST 6 — Engines remain completely isolated
  assert.equal(successEngine.getMetricsSnapshot().totalRuns, 3);

  assert.equal(successEngine.getMetricsSnapshot().failedRuns, 0);

  assert.equal(failureEngine.getMetricsSnapshot().totalRuns, 1);

  assert.equal(cycleEngine.getMetricsSnapshot().totalRuns, 1);

  console.log("Test 6 passed: Engine metrics isolated");

  // TEST 7 — Terminal metrics remain unchanged
  const finalSnapshot = successEngine.getMetricsSnapshot();

  await sleep(150);

  assert.deepEqual(successEngine.getMetricsSnapshot(), finalSnapshot);

  assert.equal(successEngine.getActiveRunCount(), 0);
  assert.equal(failureEngine.getActiveRunCount(), 0);
  assert.equal(cycleEngine.getActiveRunCount(), 0);

  console.log("Test 7 passed: Final metrics remain stable");

  console.log("All Metrics Robustness tests passed!");
} finally {
  for (const runId of createdRunIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
