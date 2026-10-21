import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import { resolveEnvironment } from "../environments/environment-resolver.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-capstone.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

const runIds: string[] = [];

async function waitForCompletion(
  engine: PipelineEngine,
  expectedCompleted: number,
): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const metrics = engine.getMetricsSnapshot();

    if (
      metrics.totalRuns === expectedCompleted &&
      engine.getActiveRunCount() === 0
    ) {
      return;
    }

    await sleep(30);
  }

  throw new Error("Environment pipeline did not finish in time");
}

try {
  // TEST 1 — Correct branch-to-environment mapping
  assert.equal(resolveEnvironment("develop"), "TEST");
  assert.equal(resolveEnvironment("main"), "PROD");

  console.log("Test 1 passed: Branch-to-environment mapping correct");

  const engine = new PipelineEngine(workflow);

  // TEST 2 — Run TEST and PROD pipelines
  const [testRun, prodRun] = await Promise.all([
    engine.run("develop"),
    engine.run("main"),
  ]);

  runIds.push(testRun.id, prodRun.id);

  assert.notEqual(testRun.id, prodRun.id);

  assert.equal(testRun.branch, "develop");
  assert.equal(testRun.environment, "TEST");

  assert.equal(prodRun.branch, "main");
  assert.equal(prodRun.environment, "PROD");

  console.log("Test 2 passed: Both environments started correctly");

  await waitForCompletion(engine, 2);

  // TEST 3 — Both deployments complete successfully
  assert.equal(testRun.status, "SUCCESS");
  assert.equal(prodRun.status, "SUCCESS");

  for (const run of [testRun, prodRun]) {
    for (const jobId of ["build", "unit-test", "integration-test", "deploy"]) {
      assert.equal(
        run.jobs[jobId]?.status,
        "SUCCESS",
        `${run.environment}: ${jobId} did not succeed`,
      );
    }
  }

  console.log("Test 3 passed: TEST and PROD deployments succeeded");

  // TEST 4 — Environment metadata reaches every job
  for (const job of Object.values(testRun.jobs)) {
    assert.equal(job.environment, "TEST");
    assert.equal(job.branch, "develop");
  }

  for (const job of Object.values(prodRun.jobs)) {
    assert.equal(job.environment, "PROD");
    assert.equal(job.branch, "main");
  }

  console.log("Test 4 passed: Environment propagated to all jobs");

  // TEST 5 — Both runs remain independent
  assert.equal(engine.getRun(testRun.id), testRun);
  assert.equal(engine.getRun(prodRun.id), prodRun);

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 2);
  assert.equal(metrics.successfulRuns, 2);
  assert.equal(metrics.failedRuns, 0);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 5 passed: TEST and PROD runs remain independent");

  // TEST 6 — Unknown branches must be rejected
  for (const branch of ["feature/new-login", "release/v1", "Main", ""]) {
    await assert.rejects(
      () => engine.run(branch),
      `Unsupported branch ${JSON.stringify(branch)} was accepted`,
    );
  }

  assert.equal(engine.getMetricsSnapshot().totalRuns, 2);
  assert.equal(engine.getMetricsSnapshot().successfulRuns, 2);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 6 passed: Unsupported branches rejected safely");

  console.log("ALL DAY 7 ENVIRONMENT ROUTING TESTS PASSED!");
} finally {
  for (const runId of runIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
