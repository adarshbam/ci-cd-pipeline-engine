import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const baseline = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-failure-drills.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

type PipelineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

function makeVariant(
  name: string,
  modify: (workflow: Workflow) => void,
): Workflow {
  const workflow = structuredClone(baseline);

  workflow.name = name;
  modify(workflow);

  return workflow;
}

function getJob(workflow: Workflow, jobId: string) {
  const job = workflow.jobs[jobId];

  assert.ok(job, `Missing configured job: ${jobId}`);
  return job;
}

function assertJob(run: PipelineRun, jobId: string, expected: string): void {
  const job = run.jobs[jobId];

  assert.ok(job, `Missing job run: ${jobId}`);

  assert.equal(
    job.status,
    expected,
    `${jobId}: Expected ${expected}, got ${job.status}`,
  );
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timeout: ${label}`)),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function execute(workflow: Workflow): Promise<{
  engine: PipelineEngine;
  run: PipelineRun;
}> {
  const engine = new PipelineEngine(workflow);

  const run = await engine.run();

  assert.ok(run.id);
  assert.strictEqual(engine.getRun(run.id), run);

  const completed = await withTimeout(
    engine.waitForCompletion(run.id),
    workflow.name,
  );

  assert.strictEqual(completed, run);

  return { engine, run };
}

function assertMetrics(
  engine: PipelineEngine,
  successes: number,
  failures: number,
): void {
  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, successes + failures);

  assert.equal(metrics.successfulRuns, successes);
  assert.equal(metrics.failedRuns, failures);
  assert.equal(engine.getActiveRunCount(), 0);

  assert.ok(Number.isFinite(metrics.averageDurationMs));
}

// ==================================================
// TEST 1 — Healthy release
// ==================================================
{
  const { engine, run } = await execute(baseline);

  assert.equal(run.status, "SUCCESS");

  for (const jobId of Object.keys(baseline.jobs)) {
    assertJob(run, jobId, "SUCCESS");
  }

  assertMetrics(engine, 1, 0);

  console.log("Test 1 passed: Healthy release completed");
}

// ==================================================
// TEST 2 — Build failure
// ==================================================
{
  const workflow = makeVariant("day7-failed-build", (config) => {
    getJob(config, "build").steps = [
      {
        name: "Simulate Build Failure",
        run: "exit 1",
      },
    ];
  });

  const { engine, run } = await execute(workflow);

  assert.equal(run.status, "FAILED");

  assertJob(run, "build", "FAILED");
  assertJob(run, "unit-test", "SKIPPED");
  assertJob(run, "integration-test", "SKIPPED");
  assertJob(run, "deploy", "SKIPPED");
  assertJob(run, "after-deploy", "SKIPPED");

  assertMetrics(engine, 0, 1);

  console.log("Test 2 passed: Build failure blocks dependent jobs");
}

// ==================================================
// TEST 3 — Unit test failure
// ==================================================
{
  const workflow = makeVariant("day7-failed-unit-tests", (config) => {
    getJob(config, "unit-test").steps = [
      {
        name: "Simulate Unit Test Failure",
        run: "exit 2",
      },
    ];
  });

  const { engine, run } = await execute(workflow);

  assert.equal(run.status, "FAILED");

  assertJob(run, "build", "SUCCESS");
  assertJob(run, "unit-test", "FAILED");

  // Integration tests are independent of the
  // failing unit-test job.
  assertJob(run, "integration-test", "SUCCESS");

  // Deployment requires BOTH tests to succeed.
  assertJob(run, "deploy", "SKIPPED");
  assertJob(run, "after-deploy", "SKIPPED");

  assertMetrics(engine, 0, 1);

  console.log(
    "Test 3 passed: Failed tests block deployment without stopping independent jobs",
  );
}

// ==================================================
// TEST 4 — Corrupted release artifact
// ==================================================
{
  const workflow = makeVariant("day7-corrupted-artifact", (config) => {
    getJob(config, "build").steps = [
      {
        name: "Create Invalid Release",
        run: "mkdir -p dist && " + "echo 'CORRUPTED' > dist/release.txt",
      },
    ];
  });

  const { engine, run } = await execute(workflow);

  assert.equal(run.status, "FAILED");

  // Artifact upload and transfer still succeed.
  assertJob(run, "build", "SUCCESS");
  assertJob(run, "unit-test", "SUCCESS");
  assertJob(run, "integration-test", "SUCCESS");

  // grep rejects the corrupted contents.
  assertJob(run, "deploy", "FAILED");
  assertJob(run, "after-deploy", "SKIPPED");

  assertMetrics(engine, 0, 1);

  console.log(
    "Test 4 passed: Corrupted artifact fails deployment verification",
  );
}

// ==================================================
// TEST 5 — Deployment command failure
// ==================================================
{
  const workflow = makeVariant("day7-failed-deployment", (config) => {
    getJob(config, "deploy").steps = [
      {
        name: "Verify Valid Artifact",
        run: "grep -Fxq 'Release ready' " + "dist/release.txt",
      },
      {
        name: "Simulate Deployment Failure",
        run: "exit 7",
      },
      {
        name: "Should Never Execute",
        run: "echo 'UNEXPECTED DEPLOYMENT STEP'",
      },
    ];
  });

  const { engine, run } = await execute(workflow);

  assert.equal(run.status, "FAILED");

  assertJob(run, "build", "SUCCESS");
  assertJob(run, "unit-test", "SUCCESS");
  assertJob(run, "integration-test", "SUCCESS");
  assertJob(run, "deploy", "FAILED");
  assertJob(run, "after-deploy", "SKIPPED");

  assertMetrics(engine, 0, 1);

  console.log(
    "Test 5 passed: Deployment failure prevents post-deployment execution",
  );
}

// ==================================================
// TEST 6 — Recovery and concurrent releases
// ==================================================
{
  const engine = new PipelineEngine(baseline);

  // Start multiple healthy runs after the
  // intentional failures above.
  const runs = await Promise.all([engine.run(), engine.run(), engine.run()]);

  assert.equal(new Set(runs.map((run) => run.id)).size, 3);

  const completed = await withTimeout(
    Promise.all(runs.map((run) => engine.waitForCompletion(run.id))),
    "Concurrent recovery releases",
  );

  for (const run of completed) {
    assert.equal(run.status, "SUCCESS");

    for (const jobId of Object.keys(baseline.jobs)) {
      assertJob(run, jobId, "SUCCESS");
    }

    assert.strictEqual(engine.getRun(run.id), run);
  }

  assertMetrics(engine, 3, 0);

  // Waiting again must not increase the metrics.
  const before = engine.getMetricsSnapshot();

  await Promise.all(runs.map((run) => engine.waitForCompletion(run.id)));

  assert.deepEqual(engine.getMetricsSnapshot(), before);

  assertMetrics(engine, 3, 0);

  console.log(
    "Test 6 passed: Later releases succeed with clean tracking and metrics",
  );
}

console.log("");
console.log("ALL DAY 7 FAILURE & RECOVERY DRILLS PASSED!");
