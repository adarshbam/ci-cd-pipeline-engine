import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const REPOSITORY = "adarshbam/ci-cd-pipeline-engine";
const BRANCH = "main";
const WORKFLOW_PATH = "/webhooks/day7-live-github";
const STATUS_CONTEXT = "custom-ci/pipeline";

const BASE_URL = process.env.DAY7_LIVE_BASE_URL;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

interface GitHubCommitStatus {
  state: string;
  context: string;
  description?: string;
  created_at?: string;
}

function getGitValue(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function getMetrics(): Promise<Metrics> {
  assert.ok(BASE_URL);

  const url = `${BASE_URL.replace(/\/$/, "")}` + `${WORKFLOW_PATH}/metrics`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  assert.equal(response.status, 200, `Metrics endpoint unavailable: ${url}`);

  return (await response.json()) as Metrics;
}

async function getGitHubStatuses(
  commitSha: string,
): Promise<GitHubCommitStatus[]> {
  const url =
    `https://api.github.com/repos/` +
    `${REPOSITORY}/commits/${commitSha}/statuses?per_page=100`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "day7-live-ci-verification",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API returned HTTP ${response.status}: ` +
        (await response.text()).slice(0, 300),
    );
  }

  return (await response.json()) as GitHubCommitStatus[];
}

async function waitForPipeline(before: Metrics): Promise<Metrics> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const current = await getMetrics();

    const newRuns = current.totalRuns - before.totalRuns;

    if (newRuns > 0 && current.activeRuns === 0) {
      return current;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    "No completed pipeline detected. Check GitHub " +
      "Recent Deliveries, the webhook URL, ngrok, " +
      "and the server logs.",
  );
}

async function waitForGitHubStatus(
  commitSha: string,
): Promise<GitHubCommitStatus[]> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const statuses = await getGitHubStatuses(commitSha);

    const relevant = statuses.filter(
      (status) => status.context === STATUS_CONTEXT,
    );

    const hasPending = relevant.some((status) => status.state === "pending");

    const hasSuccess = relevant.some((status) => status.state === "success");

    if (hasPending && hasSuccess) {
      return relevant;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    "GitHub did not receive both pending and success " +
      `statuses for ${commitSha}. Check GitHub token ` +
      "permissions and commit-status reporting logs.",
  );
}

// -----------------------------------------------------
// Preconditions
// -----------------------------------------------------
assert.ok(BASE_URL, "Set DAY7_LIVE_BASE_URL in .env");

assert.ok(
  GITHUB_TOKEN?.trim(),
  "Set GITHUB_TOKEN in .env to verify real GitHub statuses",
);

const currentBranch = getGitValue("branch", "--show-current");

assert.equal(
  currentBranch,
  BRANCH,
  `Expected current Git branch to be ${BRANCH}`,
);

const commitSha = getGitValue("rev-parse", "HEAD");

assert.match(commitSha, /^[a-f0-9]{40}$/i);

console.log("DAY 7 — LIVE GITHUB WEBHOOK VERIFICATION");

// -----------------------------------------------------
// TEST 1 — Server metrics endpoint available
// -----------------------------------------------------
const before = await getMetrics();

console.log("Test 1 passed: Live workflow metrics endpoint available");

// -----------------------------------------------------
// TEST 2 — Verify intended repository and commit
// -----------------------------------------------------
console.log(`Repository: ${REPOSITORY}`);
console.log(`Branch: ${currentBranch}`);
console.log(`Commit: ${commitSha}`);

console.log("Test 2 passed: Git commit identity resolved");

// -----------------------------------------------------
// TEST 3 — Wait for real GitHub push
// -----------------------------------------------------
console.log("");
console.log("READY FOR REAL GITHUB PUSH");
console.log("");
console.log("In ANOTHER terminal, run:");
console.log("");
console.log("  git push origin main");
console.log("");
console.log("Waiting for GitHub to trigger the pipeline...");

const after = await waitForPipeline(before);

assert.equal(
  after.totalRuns,
  before.totalRuns + 1,
  "Expected exactly one new pipeline",
);

console.log("Test 3 passed: Real GitHub delivery triggered one pipeline");

// -----------------------------------------------------
// TEST 4 — Pipeline completed successfully
// -----------------------------------------------------
assert.equal(after.successfulRuns, before.successfulRuns + 1);

assert.equal(after.failedRuns, before.failedRuns);

assert.equal(after.activeRuns, 0);

console.log("Test 4 passed: Live pipeline finished successfully");

// -----------------------------------------------------
// TEST 5 — GitHub received both commit statuses
// -----------------------------------------------------
const statuses = await waitForGitHubStatus(commitSha);

assert.ok(statuses.some((status) => status.state === "pending"));

assert.ok(statuses.some((status) => status.state === "success"));

console.log("Test 5 passed: GitHub received pending and success statuses");

// -----------------------------------------------------
// TEST 6 — Final commit status is successful
// -----------------------------------------------------
const latestStatus = statuses[0];

assert.ok(latestStatus);

assert.equal(
  latestStatus.state,
  "success",
  "Latest GitHub commit status should be success",
);

console.log("Test 6 passed: Latest GitHub commit status is successful");

console.log("");
console.log("ALL DAY 7 LIVE GITHUB WEBHOOK TESTS PASSED!");
