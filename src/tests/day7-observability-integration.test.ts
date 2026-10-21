import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import { readLogEntries } from "../logging/log-reader.js";
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

    await sleep(25);
  }

  throw new Error("Pipeline metrics did not settle within 30 seconds");
}

try {
  const engine = new PipelineEngine(workflow);

  // TEST 1 — Successful pipeline and job statuses
  const successRun = await engine.run();
  runIds.push(successRun.id);

  await waitForCompletion(engine, 1);

  assert.equal(successRun.status, "SUCCESS");

  assert.equal(engine.getRun(successRun.id), successRun);

  for (const jobId of ["build", "unit-test", "integration-test", "deploy"]) {
    assert.equal(
      successRun.jobs[jobId]?.status,
      "SUCCESS",
      `Expected ${jobId} to succeed`,
    );
  }

  console.log("Test 1 passed: Successful pipeline status recorded");

  // TEST 2 — Logs agree with successful status
  const successLogs = await readLogEntries(successRun.id);

  assert.ok(successLogs.some((entry) => entry.message === "Pipeline started"));

  assert.ok(
    successLogs.some(
      (entry) => entry.message === "Pipeline completed successfully",
    ),
  );

  for (const jobId of ["build", "unit-test", "integration-test", "deploy"]) {
    const jobLogs = successLogs.filter((entry) => entry.jobId === jobId);

    assert.equal(
      jobLogs.filter((entry) => entry.message === "Job started").length,
      1,
      `${jobId}: expected one start event`,
    );

    assert.equal(
      jobLogs.filter((entry) => entry.message === "Job completed successfully!")
        .length,
      1,
      `${jobId}: expected one completion event`,
    );
  }

  console.log("Test 2 passed: Successful lifecycle logs consistent");

  // TEST 3 — Success metrics reflect the completed run
  const successMetrics = engine.getMetricsSnapshot();

  assert.equal(successMetrics.totalRuns, 1);
  assert.equal(successMetrics.successfulRuns, 1);
  assert.equal(successMetrics.failedRuns, 0);
  assert.equal(engine.getActiveRunCount(), 0);

  assert.ok(Number.isFinite(successMetrics.averageDurationMs));

  assert.ok(successMetrics.averageDurationMs >= 0);

  console.log("Test 3 passed: Success metrics match pipeline state");

  // TEST 4 — Failed deployment produces FAILED status
  const failedWorkflow = structuredClone(workflow);

  failedWorkflow.name = "day7-observability-failure";
  failedWorkflow.webhook.url = "/webhooks/day7-observability-failure";

  const deployConfig = failedWorkflow.jobs.deploy;

  assert.ok(deployConfig);

  // Deployment deliberately fails after its prerequisites
  // succeed, without changing production code.
  deployConfig.steps = [
    {
      name: "Fail Deployment",
      run: "exit 1",
    },
  ];

  const failedEngine = new PipelineEngine(failedWorkflow);

  const failedRun = await failedEngine.run();
  runIds.push(failedRun.id);

  await waitForCompletion(failedEngine, 1);

  assert.equal(failedRun.status, "FAILED");

  assert.equal(failedRun.jobs.build?.status, "SUCCESS");

  assert.equal(failedRun.jobs["unit-test"]?.status, "SUCCESS");

  assert.equal(failedRun.jobs["integration-test"]?.status, "SUCCESS");

  assert.equal(failedRun.jobs.deploy?.status, "FAILED");

  assert.ok(
    failedRun.jobs.deploy?.failureReason,
    "Failed deployment must preserve its failure reason",
  );

  console.log("Test 4 passed: Failed deployment state preserved");

  // TEST 5 — Failed run logs and metrics are consistent
  const failedLogs = await readLogEntries(failedRun.id);

  assert.ok(
    failedLogs.some(
      (entry) => entry.jobId === "deploy" && entry.level === "ERROR",
    ),
    "Expected an ERROR log for failed deployment",
  );

  assert.ok(
    failedLogs.some(
      (entry) =>
        entry.level === "ERROR" && entry.message.includes("Pipeline failed"),
    ),
    "Expected pipeline failure lifecycle log",
  );

  const failedMetrics = failedEngine.getMetricsSnapshot();

  assert.equal(failedMetrics.totalRuns, 1);
  assert.equal(failedMetrics.successfulRuns, 0);
  assert.equal(failedMetrics.failedRuns, 1);
  assert.equal(failedEngine.getActiveRunCount(), 0);

  console.log("Test 5 passed: Failure logs and metrics consistent");

  // TEST 6 — Multiple runs remain independent
  const secondSuccessRun = await engine.run();
  runIds.push(secondSuccessRun.id);

  await waitForCompletion(engine, 2);

  assert.equal(secondSuccessRun.status, "SUCCESS");

  assert.notEqual(secondSuccessRun.id, successRun.id);

  assert.notEqual(secondSuccessRun.id, failedRun.id);

  const finalMetrics = engine.getMetricsSnapshot();

  assert.equal(finalMetrics.totalRuns, 2);
  assert.equal(finalMetrics.successfulRuns, 2);
  assert.equal(finalMetrics.failedRuns, 0);
  assert.equal(engine.getActiveRunCount(), 0);

  const secondLogs = await readLogEntries(secondSuccessRun.id);

  for (const entry of successLogs) {
    assert.equal(entry.runId, successRun.id);
  }

  for (const entry of failedLogs) {
    assert.equal(entry.runId, failedRun.id);
  }

  for (const entry of secondLogs) {
    assert.equal(entry.runId, secondSuccessRun.id);
  }

  assert.equal(failedEngine.getMetricsSnapshot().failedRuns, 1);

  console.log("Test 6 passed: Logs and metrics remain isolated");

  console.log("ALL DAY 7 OBSERVABILITY INTEGRATION TESTS PASSED!");
} finally {
  for (const runId of runIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
