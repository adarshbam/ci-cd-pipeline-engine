import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-release-smoke.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

type PipelineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

function assertJobStatus(
  run: PipelineRun,
  jobId: string,
  expected: string,
): void {
  const job = run.jobs[jobId];

  assert.ok(job, `Missing job: ${jobId}`);

  assert.equal(job.status, expected, `Incorrect status for ${jobId}`);
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timeout: ${label}`));
        }, 20_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

// --------------------------------------------------
// TEST 1 — Release configuration is valid
// --------------------------------------------------
{
  assert.equal(workflow.name, "day7-release-smoke");

  assert.equal(workflow.webhook.url, "/webhooks/day7-release-smoke");

  assert.deepEqual(workflow.trigger.events, ["push"]);

  assert.equal(Object.keys(workflow.jobs).length, 4);

  console.log("Test 1 passed: Release configuration loaded");
}

// --------------------------------------------------
// TEST 2 — DAG dependencies are configured
// --------------------------------------------------
{
  const build = workflow.jobs["build"];
  const unit = workflow.jobs["unit-test"];
  const integration = workflow.jobs["integration-test"];
  const deploy = workflow.jobs["deploy"];

  assert.ok(build);
  assert.ok(unit);
  assert.ok(integration);
  assert.ok(deploy);

  assert.deepEqual(unit.needs, ["build"]);

  assert.deepEqual(integration.needs, ["build"]);

  assert.deepEqual(deploy.needs, ["build", "unit-test", "integration-test"]);

  for (const dependency of deploy.needs ?? []) {
    assert.ok(workflow.jobs[dependency], `Missing dependency: ${dependency}`);
  }

  console.log("Test 2 passed: Release DAG dependencies configured");
}

// --------------------------------------------------
// TEST 3 — Artifact transfer is configured
// --------------------------------------------------
{
  const build = workflow.jobs["build"];
  const deploy = workflow.jobs["deploy"];

  assert.ok(build);
  assert.ok(deploy);

  const upload = build.artifacts?.upload?.[0];
  const download = deploy.artifacts?.download?.[0];

  assert.ok(upload, "Missing build artifact upload");
  assert.ok(download, "Missing deploy artifact download");

  assert.equal(upload.name, "release-bundle");
  assert.equal(upload.path, "dist/release.txt");

  assert.equal(download.name, "release-bundle");
  assert.equal(download.fromJob, "build");
  assert.equal(download.path, "dist/release.txt");

  console.log("Test 3 passed: Build-to-deploy artifact configured");
}

// --------------------------------------------------
// TEST 4 — Pipeline starts and is trackable
// --------------------------------------------------
const engine = new PipelineEngine(workflow);

const run = await engine.run();

{
  assert.ok(run.id);
  assert.equal(run.pipelineId, workflow.name);

  assert.strictEqual(engine.getRun(run.id), run);

  assert.equal(Object.keys(run.jobs).length, 4);

  assert.ok(run.status === "RUNNING" || run.status === "SUCCESS");

  console.log("Test 4 passed: Release pipeline started and tracked");
}

// --------------------------------------------------
// TEST 5 — Release executes successfully
// --------------------------------------------------
{
  const completed = await withTimeout(
    engine.waitForCompletion(run.id),
    "Release smoke pipeline",
  );

  assert.strictEqual(completed, run);
  assert.equal(completed.status, "SUCCESS");

  assertJobStatus(run, "build", "SUCCESS");
  assertJobStatus(run, "unit-test", "SUCCESS");
  assertJobStatus(run, "integration-test", "SUCCESS");
  assertJobStatus(run, "deploy", "SUCCESS");

  // The deploy job's grep command verifies that
  // the artifact downloaded from build contains
  // the expected release data.

  console.log(
    "Test 5 passed: Build, tests, artifact transfer and deploy succeeded",
  );
}

// --------------------------------------------------
// TEST 6 — Final metrics and completion are stable
// --------------------------------------------------
{
  const before = engine.getMetricsSnapshot();

  assert.equal(before.totalRuns, 1);
  assert.equal(before.successfulRuns, 1);
  assert.equal(before.failedRuns, 0);

  assert.equal(engine.getActiveRunCount(), 0);

  assert.ok(Number.isFinite(before.averageDurationMs));

  assert.ok(before.averageDurationMs >= 0);

  // Re-await the same release.
  const secondCompletion = await withTimeout(
    engine.waitForCompletion(run.id),
    "Second completion",
  );

  assert.strictEqual(secondCompletion, run);

  const after = engine.getMetricsSnapshot();

  // Completion must not modify already finalized
  // metrics or count the release twice.
  assert.deepEqual(after, before);

  console.log("Test 6 passed: Release metrics finalized exactly once");
}

console.log("ALL DAY 7 RELEASE SMOKE TESTS PASSED!");
