import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

import { withWorkspace } from "../runner/workspace.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const baseline = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-resource-hardening.json", import.meta.url),
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
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

function assertJobStatus(
  run: PipelineRun,
  jobId: string,
  expectedStatus: string,
): void {
  const job = run.jobs[jobId];

  assert.ok(job, `Missing job: ${jobId}`);
  assert.equal(job.status, expectedStatus);
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

// --------------------------------------------------
// TEST 1 — Successful workspace is removed
// --------------------------------------------------
{
  let workspacePath = "";

  const result = await withWorkspace(async (workspace) => {
    workspacePath = workspace;

    const nested = join(workspace, "build", "dist");

    await mkdir(nested, { recursive: true });

    await writeFile(join(nested, "release.txt"), "release-ready");

    assert.equal(await pathExists(workspace), true);

    return "BUILD_SUCCESS";
  });

  assert.equal(result, "BUILD_SUCCESS");

  assert.ok(workspacePath);
  assert.equal(await pathExists(workspacePath), false);

  console.log("Test 1 passed: Successful workspace cleaned up");
}

// --------------------------------------------------
// TEST 2 — Failed workspace is still removed
// --------------------------------------------------
{
  let workspacePath = "";

  await assert.rejects(
    () =>
      withWorkspace(async (workspace) => {
        workspacePath = workspace;

        await writeFile(join(workspace, "temporary.txt"), "temporary-data");

        throw new Error("Intentional workspace failure");
      }),
    /Intentional workspace failure/,
  );

  assert.ok(workspacePath);
  assert.equal(await pathExists(workspacePath), false);

  console.log("Test 2 passed: Failed workspace cleaned up");
}

// --------------------------------------------------
// TEST 3 — Concurrent workspaces are isolated
// --------------------------------------------------
{
  const paths: string[] = [];

  const results = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      withWorkspace(async (workspace) => {
        paths.push(workspace);

        const filename = join(workspace, `job-${index}.txt`);

        await writeFile(filename, String(index));

        const contents = await readFile(filename, "utf8");

        assert.equal(contents, String(index));

        return index;
      }),
    ),
  );

  assert.deepEqual(results, [0, 1, 2, 3, 4]);

  assert.equal(new Set(paths).size, 5);

  for (const path of paths) {
    assert.equal(await pathExists(path), false);
  }

  console.log("Test 3 passed: Concurrent workspaces isolated and removed");
}

// --------------------------------------------------
// TEST 4 — Failed job does not leave an active run
// --------------------------------------------------
{
  const workflow = makeWorkflow("day7-resource-failure", {
    build: {
      steps: [
        {
          name: "Fail Build",
          run: "exit 1",
        },
      ],
    },
    deploy: {
      needs: ["build"],
      steps: [
        {
          name: "Should Not Deploy",
          run: "echo must-not-run",
        },
      ],
    },
  });

  const engine = new PipelineEngine(workflow);

  const run = await engine.run();
  const completed = await complete(engine, run.id);

  assert.equal(completed.status, "FAILED");

  assertJobStatus(run, "build", "FAILED");
  assertJobStatus(run, "deploy", "SKIPPED");

  assertMetrics(engine, 0, 1);

  console.log("Test 4 passed: Failed pipeline releases active-run tracking");
}

// --------------------------------------------------
// TEST 5 — Later work completes after a failed run
// --------------------------------------------------
{
  const failedWorkflow = makeWorkflow("day7-resource-retry-failure", {
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

  // Both workflows inherit the same configured
  // concurrency group.
  const failedRun = await failedEngine.run();

  await complete(failedEngine, failedRun.id);

  assert.equal(failedRun.status, "FAILED");
  assertMetrics(failedEngine, 0, 1);

  const healthyRun = await healthyEngine.run();

  await complete(healthyEngine, healthyRun.id);

  assert.equal(healthyRun.status, "SUCCESS");

  assertJobStatus(healthyRun, "build", "SUCCESS");
  assertJobStatus(healthyRun, "test", "SUCCESS");

  assertMetrics(healthyEngine, 1, 0);

  console.log("Test 5 passed: New pipeline completes after failure");
}

// --------------------------------------------------
// TEST 6 — Concurrent runs all settle correctly
// --------------------------------------------------
{
  const engine = new PipelineEngine(baseline);

  const runs = await Promise.all(Array.from({ length: 5 }, () => engine.run()));

  assert.equal(new Set(runs.map((run) => run.id)).size, 5);

  const completed = await Promise.all(
    runs.map((run) => complete(engine, run.id)),
  );

  for (const run of completed) {
    assert.equal(run.status, "SUCCESS");

    assertJobStatus(run, "build", "SUCCESS");
    assertJobStatus(run, "test", "SUCCESS");
  }

  assertMetrics(engine, 5, 0);

  // Awaiting completed runs again must not
  // change their metrics.
  await Promise.all(runs.map((run) => complete(engine, run.id)));

  assertMetrics(engine, 5, 0);

  console.log("Test 6 passed: Concurrent runs settle without resource leaks");
}

// --------------------------------------------------
// TEST 7 — Scheduler failure doesn't block later work
// --------------------------------------------------
{
  const cycleWorkflow = makeWorkflow("day7-resource-cycle", {
    first: {
      needs: ["second"],
      steps: [
        {
          name: "First",
          run: "echo first",
        },
      ],
    },
    second: {
      needs: ["first"],
      steps: [
        {
          name: "Second",
          run: "echo second",
        },
      ],
    },
  });

  const failedEngine = new PipelineEngine(cycleWorkflow);

  const failedRun = await failedEngine.run();

  await complete(failedEngine, failedRun.id);

  assert.equal(failedRun.status, "FAILED");
  assertMetrics(failedEngine, 0, 1);

  const healthyEngine = new PipelineEngine(baseline);

  const healthyRun = await healthyEngine.run();

  await complete(healthyEngine, healthyRun.id);

  assert.equal(healthyRun.status, "SUCCESS");
  assertMetrics(healthyEngine, 1, 0);

  console.log("Test 7 passed: Scheduler exception does not block later runs");
}

console.log("ALL DAY 7 RESOURCE HARDENING TESTS PASSED!");
