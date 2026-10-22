import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-live-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

type PipelineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

interface GitHubStatus {
  state: string;
  context: string;
}

const REPOSITORY = "adarshbam/ci-cd-pipeline-engine";
const CONTEXT = "custom-ci/pipeline";

const BASE_URL = process.env.DAY7_LIVE_BASE_URL?.replace(/\/$/, "");

const TOKEN = process.env.GITHUB_TOKEN;

function assertJob(run: PipelineRun, id: string, expected: string): void {
  const job = run.jobs[id];

  assert.ok(job, `Missing job: ${id}`);
  assert.equal(job.status, expected);
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function git(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
  }).trim();
}

async function getMetrics(): Promise<Metrics> {
  assert.ok(BASE_URL);

  const response = await fetch(
    `${BASE_URL}/webhooks/day7-live-github/metrics`,
    { signal: AbortSignal.timeout(10_000) },
  );

  assert.equal(
    response.status,
    200,
    "Live workflow metrics endpoint unavailable",
  );

  return (await response.json()) as Metrics;
}

async function getStatuses(sha: string): Promise<GitHubStatus[]> {
  assert.ok(TOKEN);

  const url =
    `https://api.github.com/repos/${REPOSITORY}` +
    `/commits/${sha}/statuses?per_page=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "day7-release-verification",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`GitHub status API failed: ${response.status}`);
  }

  return (await response.json()) as GitHubStatus[];
}

// --------------------------------------------------
// TEST 1 — Workflow configuration
// --------------------------------------------------
{
  assert.equal(workflow.name, "day7-live-github");

  assert.equal(workflow.webhook.url, "/webhooks/day7-live-github");

  assert.ok(workflow.webhook.methods?.includes("POST"));

  assert.equal(Object.keys(workflow.jobs).length, 4);

  console.log("Test 1 passed: Release workflow configured");
}

// --------------------------------------------------
// TEST 2 — Dependency graph
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

  console.log("Test 2 passed: Full release DAG configured");
}

// --------------------------------------------------
// TEST 3 — Artifact configuration
// --------------------------------------------------
{
  const build = workflow.jobs["build"];
  const deploy = workflow.jobs["deploy"];

  assert.ok(build);
  assert.ok(deploy);

  const upload = build.artifacts?.upload?.[0];
  const download = deploy.artifacts?.download?.[0];

  assert.ok(upload);
  assert.ok(download);

  assert.equal(upload.name, "release-bundle");
  assert.equal(download.name, "release-bundle");
  assert.equal(download.fromJob, "build");

  assert.equal(upload.path, "dist/release.txt");
  assert.equal(download.path, "dist/release.txt");

  console.log("Test 3 passed: Release artifact transfer configured");
}

// --------------------------------------------------
// TEST 4 — Real engine execution and parallel jobs
// --------------------------------------------------
{
  const engine = new PipelineEngine(workflow);
  const run = await engine.run();

  let parallelObserved = false;
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const unit = run.jobs["unit-test"];
    const integration = run.jobs["integration-test"];

    if (unit?.status === "RUNNING" && integration?.status === "RUNNING") {
      parallelObserved = true;
      break;
    }

    if (run.status !== "RUNNING") break;

    await sleep(20);
  }

  const completed = await withTimeout(
    engine.waitForCompletion(run.id),
    "Full release execution",
  );

  assert.strictEqual(completed, run);

  assert.equal(completed.status, "SUCCESS");

  assertJob(run, "build", "SUCCESS");
  assertJob(run, "unit-test", "SUCCESS");
  assertJob(run, "integration-test", "SUCCESS");
  assertJob(run, "deploy", "SUCCESS");

  assert.equal(
    parallelObserved,
    true,
    "Unit and integration tests did not overlap",
  );

  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 1);
  assert.equal(metrics.successfulRuns, 1);
  assert.equal(metrics.failedRuns, 0);
  assert.equal(engine.getActiveRunCount(), 0);

  console.log("Test 4 passed: Parallel tests and full deployment succeeded");
}

// --------------------------------------------------
// TEST 5 — Invalid release artifact blocks deployment
// --------------------------------------------------
{
  const corrupted = JSON.parse(JSON.stringify(workflow)) as Workflow;

  corrupted.name = "day7-corrupted-release";

  const build = corrupted.jobs["build"];
  assert.ok(build);

  build.steps = [
    {
      name: "Create Invalid Release",
      run: "mkdir -p dist && " + "echo 'INVALID RELEASE' > dist/release.txt",
    },
  ];

  const engine = new PipelineEngine(corrupted);
  const run = await engine.run();

  await withTimeout(
    engine.waitForCompletion(run.id),
    "Invalid release verification",
  );

  assert.equal(run.status, "FAILED");

  assertJob(run, "build", "SUCCESS");
  assertJob(run, "unit-test", "SUCCESS");
  assertJob(run, "integration-test", "SUCCESS");
  assertJob(run, "deploy", "FAILED");

  console.log("Test 5 passed: Invalid artifact rejected by deployment");
}

// --------------------------------------------------
// LIVE TEST PRECONDITIONS
// --------------------------------------------------
assert.ok(BASE_URL, "Set DAY7_LIVE_BASE_URL in .env");

assert.ok(TOKEN?.trim(), "Set GITHUB_TOKEN in .env");

assert.equal(
  git("branch", "--show-current"),
  "main",
  "Run live verification on the main branch",
);

const commitSha = git("rev-parse", "HEAD");

assert.match(commitSha, /^[a-f0-9]{40}$/i);

// --------------------------------------------------
// TEST 6 — Live server is ready
// --------------------------------------------------
const before = await getMetrics();

console.log("Test 6 passed: Live release endpoint available");

console.log("");
console.log(`Repository: ${REPOSITORY}`);
console.log(`Commit: ${commitSha}`);
console.log("");
console.log("READY FOR REAL GITHUB PUSH");
console.log("Run in another terminal:");
console.log("  git push origin main");
console.log("");

// --------------------------------------------------
// TEST 7 — Real push executes full release
// --------------------------------------------------
let after: Metrics | undefined;

const deadline = Date.now() + 180_000;

while (Date.now() < deadline) {
  const current = await getMetrics();

  if (
    current.totalRuns === before.totalRuns + 1 &&
    current.activeRuns === 0 &&
    current.successfulRuns === before.successfulRuns + 1
  ) {
    after = current;
    break;
  }

  if (current.totalRuns > before.totalRuns + 1) {
    throw new Error("Multiple deliveries occurred during verification");
  }

  if (
    current.totalRuns > before.totalRuns &&
    current.failedRuns > before.failedRuns
  ) {
    throw new Error("Live release pipeline failed");
  }

  await sleep(1_000);
}

assert.ok(after, "Live release did not complete successfully");

assert.equal(after.totalRuns, before.totalRuns + 1);
assert.equal(after.activeRuns, 0);
assert.equal(after.failedRuns, before.failedRuns);

console.log("Test 7 passed: Real push triggered successful release");

// --------------------------------------------------
// TEST 8 — Final GitHub commit status
// --------------------------------------------------
let verifiedStatuses: GitHubStatus[] | undefined;

const statusDeadline = Date.now() + 60_000;

while (Date.now() < statusDeadline) {
  const statuses = (await getStatuses(commitSha)).filter(
    (status) => status.context === CONTEXT,
  );

  const pending = statuses.some((status) => status.state === "pending");

  const success = statuses.some((status) => status.state === "success");

  if (pending && success && statuses[0]?.state === "success") {
    verifiedStatuses = statuses;
    break;
  }

  await sleep(1_000);
}

assert.ok(
  verifiedStatuses,
  "GitHub did not receive pending → success statuses",
);

console.log("Test 8 passed: GitHub received final SUCCESS status");

console.log("");
console.log("ALL DAY 7 FULL RELEASE VERIFICATION TESTS PASSED!");
