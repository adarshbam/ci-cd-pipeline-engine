import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import { restoreArtifact } from "../artifacts/artifact-manager.js";
import type { Workflow } from "../workflow/workflow.js";

const fileUrl = new URL("../../workflows/day7-capstone.json", import.meta.url);

const workflow = JSON.parse(await readFile(fileUrl, "utf8")) as Workflow;

const runIds: string[] = [];

async function waitForCompletion(engine: PipelineEngine): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (
      engine.getMetricsSnapshot().totalRuns === 1 &&
      engine.getActiveRunCount() === 0
    ) {
      return;
    }

    await sleep(30);
  }

  throw new Error("Pipeline did not finish in time");
}

async function readStoredArtifact(runId: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "day7-artifact-"));

  const destination = join(directory, "restored-release.txt");

  try {
    await restoreArtifact(runId, "build", "release-bundle", destination);

    return await readFile(destination, "utf8");
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

try {
  const engine = new PipelineEngine(workflow);

  const run = await engine.run();
  runIds.push(run.id);

  await waitForCompletion(engine);

  // TEST 1 — Build successfully creates and uploads artifact
  assert.equal(run.jobs.build?.status, "SUCCESS");

  const releaseContents = await readStoredArtifact(run.id);

  assert.equal(releaseContents.trim(), "Release ready");

  console.log("Test 1 passed: Real release artifact stored");

  // TEST 2 — Downloaded artifact is used by deployment
  assert.equal(run.status, "SUCCESS");

  assert.equal(
    run.jobs.deploy?.status,
    "SUCCESS",
    "Deployment failed to restore or verify release",
  );

  console.log("Test 2 passed: Deployment verified artifact contents");

  // TEST 3 — All prerequisite jobs completed successfully
  assert.equal(run.jobs["unit-test"]?.status, "SUCCESS");

  assert.equal(run.jobs["integration-test"]?.status, "SUCCESS");

  assert.deepEqual(
    [...(workflow.jobs.deploy?.needs ?? [])].sort(),
    ["build", "unit-test", "integration-test"].sort(),
  );

  console.log("Test 3 passed: Dependencies and artifact transfer work");

  // TEST 4 — Missing artifact fails deployment
  const missingWorkflow = structuredClone(workflow);

  missingWorkflow.name = "day7-missing-artifact";
  missingWorkflow.webhook.url = "/webhooks/day7-missing-artifact";

  const missingDownload = missingWorkflow.jobs.deploy?.artifacts?.download?.[0];

  assert.ok(missingDownload);

  missingDownload.name = "nonexistent-bundle";

  const missingEngine = new PipelineEngine(missingWorkflow);

  const missingRun = await missingEngine.run();
  runIds.push(missingRun.id);

  await waitForCompletion(missingEngine);

  assert.equal(missingRun.jobs.build?.status, "SUCCESS");

  assert.equal(missingRun.jobs.deploy?.status, "FAILED");

  assert.equal(missingRun.status, "FAILED");

  console.log("Test 4 passed: Missing artifact fails deployment");

  // TEST 5 — Incorrect artifact contents fail verification
  const corruptedWorkflow = structuredClone(workflow);

  corruptedWorkflow.name = "day7-corrupted-artifact";
  corruptedWorkflow.webhook.url = "/webhooks/day7-corrupted-artifact";

  const buildJob = corruptedWorkflow.jobs.build;

  assert.ok(buildJob);

  buildJob.steps = [
    {
      name: "Build Corrupted Release",
      run: "mkdir -p dist && echo 'Corrupted release' > dist/release.txt",
    },
  ];

  const corruptedEngine = new PipelineEngine(corruptedWorkflow);

  const corruptedRun = await corruptedEngine.run();
  runIds.push(corruptedRun.id);

  await waitForCompletion(corruptedEngine);

  assert.equal(corruptedRun.jobs.build?.status, "SUCCESS");

  assert.equal(corruptedRun.jobs.deploy?.status, "FAILED");

  assert.equal(corruptedRun.status, "FAILED");

  const corruptedContents = await readStoredArtifact(corruptedRun.id);

  assert.equal(corruptedContents.trim(), "Corrupted release");

  console.log("Test 5 passed: Corrupted contents rejected");

  // TEST 6 — Artifact storage remains isolated by run ID
  const originalAgain = await readStoredArtifact(run.id);

  assert.equal(originalAgain.trim(), "Release ready");

  assert.notEqual(originalAgain.trim(), corruptedContents.trim());

  assert.equal(engine.getMetricsSnapshot().successfulRuns, 1);

  assert.equal(missingEngine.getMetricsSnapshot().failedRuns, 1);

  assert.equal(corruptedEngine.getMetricsSnapshot().failedRuns, 1);

  console.log("Test 6 passed: Artifact and pipeline isolation");

  console.log("ALL DAY 7 ARTIFACT TRANSFER TESTS PASSED!");
} finally {
  for (const runId of runIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
