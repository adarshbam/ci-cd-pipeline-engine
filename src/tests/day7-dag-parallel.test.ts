import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const fileUrl = new URL("../../workflows/day7-capstone.json", import.meta.url);

const workflow = JSON.parse(await readFile(fileUrl, "utf8")) as Workflow;

const runIds: string[] = [];

async function waitForCompletion(
  engine: PipelineEngine,
  expectedRuns: number,
): Promise<void> {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const metrics = engine.getMetricsSnapshot();

    if (
      metrics.totalRuns === expectedRuns &&
      engine.getActiveRunCount() === 0
    ) {
      return;
    }

    await sleep(25);
  }

  throw new Error("Pipeline did not finish in time");
}

try {
  // TEST 1 — Verify the DAG relationships
  assert.deepEqual(workflow.jobs["unit-test"]?.needs, ["build"]);

  assert.deepEqual(workflow.jobs["integration-test"]?.needs, ["build"]);

  assert.deepEqual(
    [...(workflow.jobs.deploy?.needs ?? [])].sort(),
    ["build", "unit-test", "integration-test"].sort(),
  );

  console.log("Test 1 passed: DAG configured correctly");

  const engine = new PipelineEngine(workflow);

  // TEST 2 — Pipeline starts
  const run = await engine.run();
  runIds.push(run.id);

  assert.ok(run.id);
  assert.equal(run.status, "RUNNING");

  assert.equal(run.jobs.deploy?.status, "QUEUED");

  console.log("Test 2 passed: Pipeline started");

  // Observe execution while the pipeline is running.
  let parallelObserved = false;
  let invalidDependencyOrder = false;
  let deployWaited = false;

  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const build = getJobStatus("build");
    const unit = getJobStatus("unit-test");
    const integration = getJobStatus("integration-test");
    const deploy = getJobStatus("deploy");

    // Neither test may start before build succeeds.
    if (
      (unit === "RUNNING" || integration === "RUNNING") &&
      build !== "SUCCESS"
    ) {
      invalidDependencyOrder = true;
    }

    // Deployment may not start before both tests succeed.
    if (
      deploy === "RUNNING" &&
      (build !== "SUCCESS" || unit !== "SUCCESS" || integration !== "SUCCESS")
    ) {
      invalidDependencyOrder = true;
    }

    if (unit === "RUNNING" && integration === "RUNNING") {
      parallelObserved = true;

      if (deploy === "QUEUED") {
        deployWaited = true;
      }
    }

    function getJobStatus(jobId: string): string | undefined {
      return run.jobs[jobId]?.status;
    }

    function getPipelineStatus(): string {
      return run.status;
    }

    const status = getPipelineStatus();

    if (status === "SUCCESS" || status === "FAILED") {
      break;
    }

    await sleep(20);
  }

  await waitForCompletion(engine, 1);

  // TEST 3 — Dependencies respected
  assert.equal(
    invalidDependencyOrder,
    false,
    "A job started before its dependencies completed",
  );

  console.log("Test 3 passed: Dependency order respected");

  // TEST 4 — Both tests ran concurrently
  assert.equal(
    parallelObserved,
    true,
    "Unit and integration tests never overlapped",
  );

  console.log("Test 4 passed: Parallel execution verified");

  // TEST 5 — Deployment waited and succeeded
  assert.equal(
    deployWaited,
    true,
    "Deploy was not observed waiting for parallel tests",
  );

  assert.equal(run.status, "SUCCESS");

  for (const jobId of ["build", "unit-test", "integration-test", "deploy"]) {
    assert.equal(
      run.jobs[jobId]?.status,
      "SUCCESS",
      `${jobId} did not succeed`,
    );
  }

  assert.equal(engine.getMetricsSnapshot().successfulRuns, 1);

  console.log("Test 5 passed: Deployment waited and succeeded");

  // TEST 6 — Failed prerequisite skips deployment
  const failureWorkflow = structuredClone(workflow);

  failureWorkflow.name = "day7-parallel-failure";

  failureWorkflow.webhook.url = "/webhooks/day7-parallel-failure";

  const failingJob = failureWorkflow.jobs["integration-test"];

  assert.ok(failingJob);

  failingJob.steps = [
    {
      name: "Simulated Integration Failure",
      run: "exit 1",
    },
  ];

  const failureEngine = new PipelineEngine(failureWorkflow);

  const failedRun = await failureEngine.run();
  runIds.push(failedRun.id);

  await waitForCompletion(failureEngine, 1);

  assert.equal(failedRun.status, "FAILED");

  assert.equal(failedRun.jobs.build?.status, "SUCCESS");

  assert.equal(failedRun.jobs["integration-test"]?.status, "FAILED");

  assert.equal(failedRun.jobs.deploy?.status, "SKIPPED");

  assert.equal(failureEngine.getMetricsSnapshot().failedRuns, 1);

  console.log("Test 6 passed: Failed dependency skips deployment");

  console.log("ALL DAY 7 DAG & PARALLEL TESTS PASSED!");
} finally {
  for (const runId of runIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
