import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const baseline = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-failure-hardening.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

type PipelineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

function makeWorkflow(name: string, jobs: Workflow["jobs"]): Workflow {
  return {
    ...baseline,
    name,
    jobs,
  };
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
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

async function complete(
  engine: PipelineEngine,
  runId: string,
): Promise<PipelineRun> {
  return withTimeout(engine.waitForCompletion(runId), `Pipeline ${runId}`);
}

// Safely access a job and verify its status.
// Compatible with strict TypeScript settings.
function assertJobStatus(
  run: PipelineRun,
  jobId: string,
  expectedStatus: string,
): void {
  const job = run.jobs[jobId];

  assert.ok(job, `Expected job "${jobId}" to exist in pipeline ${run.id}`);

  assert.equal(
    job.status,
    expectedStatus,
    `Unexpected status for job "${jobId}"`,
  );
}

function assertMetrics(
  engine: PipelineEngine,
  total: number,
  successes: number,
  failures: number,
): void {
  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, total);
  assert.equal(metrics.successfulRuns, successes);
  assert.equal(metrics.failedRuns, failures);
  assert.equal(engine.getActiveRunCount(), 0);

  assert.ok(Number.isFinite(metrics.averageDurationMs));

  assert.ok(metrics.averageDurationMs >= 0);
}

// -----------------------------------------------------
// TEST 1 — Healthy pipeline completes normally
// -----------------------------------------------------
{
  const engine = new PipelineEngine(baseline);

  const run = await engine.run();
  const completed = await complete(engine, run.id);

  assert.strictEqual(completed, run);
  assert.equal(completed.status, "SUCCESS");

  assertJobStatus(run, "build", "SUCCESS");
  assertJobStatus(run, "test", "SUCCESS");

  assertMetrics(engine, 1, 1, 0);

  console.log("Test 1 passed: Healthy pipeline completes normally");
}

// -----------------------------------------------------
// TEST 2 — Failed command skips dependent jobs
// -----------------------------------------------------
{
  const workflow = makeWorkflow("day7-failed-command", {
    build: {
      steps: [
        {
          name: "Fail Build",
          run: "exit 17",
        },
      ],
    },
    test: {
      needs: ["build"],
      steps: [
        {
          name: "Should Not Execute",
          run: "echo should-not-run",
        },
      ],
    },
  });

  const engine = new PipelineEngine(workflow);

  const run = await engine.run();
  const completed = await complete(engine, run.id);

  assert.equal(completed.status, "FAILED");

  assertJobStatus(run, "build", "FAILED");
  assertJobStatus(run, "test", "SKIPPED");

  assertMetrics(engine, 1, 0, 1);

  console.log("Test 2 passed: Failed command skips dependent job");
}

// -----------------------------------------------------
// TEST 3 — Missing executable handled safely
// -----------------------------------------------------
{
  const workflow = makeWorkflow("day7-missing-executable", {
    build: {
      steps: [
        {
          name: "Missing Command",
          run: "day7_command_that_does_not_exist",
        },
      ],
    },
  });

  const engine = new PipelineEngine(workflow);

  const run = await engine.run();
  const completed = await complete(engine, run.id);

  assert.equal(completed.status, "FAILED");

  assertJobStatus(run, "build", "FAILED");

  assertMetrics(engine, 1, 0, 1);

  console.log("Test 3 passed: Missing executable handled safely");
}

// -----------------------------------------------------
// TEST 4 — Independent jobs survive sibling failure
// -----------------------------------------------------
{
  const workflow = makeWorkflow("day7-independent-jobs", {
    broken: {
      steps: [
        {
          name: "Broken Job",
          run: "exit 1",
        },
      ],
    },
    healthy: {
      steps: [
        {
          name: "Healthy Job",
          run: "echo healthy",
        },
      ],
    },
    blocked: {
      needs: ["broken"],
      steps: [
        {
          name: "Blocked Job",
          run: "echo must-not-run",
        },
      ],
    },
  });

  const engine = new PipelineEngine(workflow);

  const run = await engine.run();
  const completed = await complete(engine, run.id);

  assert.equal(completed.status, "FAILED");

  assertJobStatus(run, "broken", "FAILED");
  assertJobStatus(run, "healthy", "SUCCESS");
  assertJobStatus(run, "blocked", "SKIPPED");

  assertMetrics(engine, 1, 0, 1);

  console.log("Test 4 passed: Independent job survives sibling failure");
}

// -----------------------------------------------------
// TEST 5 — Scheduler dependency cycle handled
// -----------------------------------------------------
{
  const workflow = makeWorkflow("day7-scheduler-cycle", {
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
  });

  const engine = new PipelineEngine(workflow);

  const run = await engine.run();
  const completed = await complete(engine, run.id);

  assert.strictEqual(completed, run);
  assert.equal(completed.status, "FAILED");

  assertMetrics(engine, 1, 0, 1);

  assert.strictEqual(engine.getRun(run.id), run);

  console.log("Test 5 passed: Scheduler exception finalizes pipeline");
}

// -----------------------------------------------------
// TEST 6 — Independent pipelines remain isolated
// -----------------------------------------------------
{
  const failedWorkflow = makeWorkflow("day7-failure-isolation", {
    build: {
      steps: [
        {
          name: "Fail",
          run: "exit 1",
        },
      ],
    },
  });

  const failedEngine = new PipelineEngine(failedWorkflow);
  const healthyEngine = new PipelineEngine(baseline);

  const [failedRun, healthyRun] = await Promise.all([
    failedEngine.run(),
    healthyEngine.run(),
  ]);

  const [failed, healthy] = await Promise.all([
    complete(failedEngine, failedRun.id),
    complete(healthyEngine, healthyRun.id),
  ]);

  assert.equal(failed.status, "FAILED");
  assert.equal(healthy.status, "SUCCESS");

  assertJobStatus(failedRun, "build", "FAILED");

  assertJobStatus(healthyRun, "build", "SUCCESS");
  assertJobStatus(healthyRun, "test", "SUCCESS");

  assertMetrics(failedEngine, 1, 0, 1);
  assertMetrics(healthyEngine, 1, 1, 0);

  console.log("Test 6 passed: Independent pipelines remain isolated");
}

// -----------------------------------------------------
// TEST 7 — Failure propagates through dependency chain
// -----------------------------------------------------
{
  const workflow = makeWorkflow("day7-deep-failure-chain", {
    build: {
      steps: [
        {
          name: "Build",
          run: "echo build-ok",
        },
      ],
    },
    test: {
      needs: ["build"],
      steps: [
        {
          name: "Fail Test",
          run: "exit 1",
        },
      ],
    },
    deploy: {
      needs: ["test"],
      steps: [
        {
          name: "Must Not Deploy",
          run: "echo deploy",
        },
      ],
    },
  });

  const engine = new PipelineEngine(workflow);

  const run = await engine.run();
  const completed = await complete(engine, run.id);

  assert.equal(completed.status, "FAILED");

  assertJobStatus(run, "build", "SUCCESS");
  assertJobStatus(run, "test", "FAILED");
  assertJobStatus(run, "deploy", "SKIPPED");

  assertMetrics(engine, 1, 0, 1);

  console.log("Test 7 passed: Dependency-chain failure propagated");
}

// -----------------------------------------------------
// TEST 8 — Concurrent failed runs counted exactly once
// -----------------------------------------------------
{
  const workflow = makeWorkflow("day7-repeated-failures", {
    build: {
      steps: [
        {
          name: "Fail",
          run: "exit 1",
        },
      ],
    },
  });

  const engine = new PipelineEngine(workflow);

  const first = await engine.run();
  const second = await engine.run();

  assert.notEqual(first.id, second.id);

  await Promise.all([complete(engine, first.id), complete(engine, second.id)]);

  assert.equal(first.status, "FAILED");
  assert.equal(second.status, "FAILED");

  assertJobStatus(first, "build", "FAILED");
  assertJobStatus(second, "build", "FAILED");

  assert.strictEqual(engine.getRun(first.id), first);

  assert.strictEqual(engine.getRun(second.id), second);

  assertMetrics(engine, 2, 0, 2);

  // Waiting again must not double-count the metrics.
  await complete(engine, first.id);

  assertMetrics(engine, 2, 0, 2);

  console.log("Test 8 passed: Concurrent failures counted once");
}

console.log("ALL DAY 7 FAILURE RECOVERY TESTS PASSED!");
