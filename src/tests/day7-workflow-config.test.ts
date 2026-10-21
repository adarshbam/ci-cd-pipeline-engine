import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Workflow } from "../workflow/workflow.js";

const fileUrl = new URL("../../workflows/day7-capstone.json", import.meta.url);

const workflow = JSON.parse(await readFile(fileUrl, "utf8")) as Workflow;

const jobs = workflow.jobs;

// TEST 1 — Workflow identity
assert.equal(workflow.name, "day7-capstone");
assert.equal(workflow.webhook.url, "/webhooks/day7-capstone");
assert.ok(workflow.trigger.events.includes("push"));

console.log("Test 1 passed: Workflow identity valid");

// TEST 2 — Required jobs and executable steps
assert.deepEqual(
  Object.keys(jobs).sort(),
  ["build", "unit-test", "integration-test", "deploy"].sort(),
);

for (const [jobId, job] of Object.entries(jobs)) {
  assert.ok(job.steps.length > 0, `${jobId}: missing steps`);

  for (const step of job.steps) {
    assert.ok(step.name.trim());

    assert.ok(
      ("run" in step && typeof step.run === "string") ||
        ("script" in step && typeof step.script === "string"),
      `${jobId}: invalid step`,
    );
  }
}

console.log("Test 2 passed: Four executable jobs");

// TEST 3 — Dependencies
assert.equal(jobs.build?.needs?.length ?? 0, 0);

assert.deepEqual(jobs["unit-test"]?.needs, ["build"]);
assert.deepEqual(jobs["integration-test"]?.needs, ["build"]);

assert.deepEqual(
  [...(jobs.deploy?.needs ?? [])].sort(),
  ["build", "unit-test", "integration-test"].sort(),
);

console.log("Test 3 passed: Dependencies configured");

// TEST 4 — Dependency graph
const visited = new Set<string>();
const visiting = new Set<string>();

function visit(jobId: string): void {
  if (visiting.has(jobId)) {
    throw new Error(`Dependency cycle at ${jobId}`);
  }

  if (visited.has(jobId)) return;

  const job = jobs[jobId];
  assert.ok(job, `Missing job: ${jobId}`);

  visiting.add(jobId);

  for (const dependency of job.needs ?? []) {
    visit(dependency);
  }

  visiting.delete(jobId);
  visited.add(jobId);
}

for (const jobId of Object.keys(jobs)) {
  visit(jobId);
}

assert.equal(visited.size, 4);

console.log("Test 4 passed: Dependency graph valid");

// TEST 5 — Build artifact upload
assert.ok(
  jobs.build?.artifacts?.upload?.some(
    (artifact) =>
      artifact.name === "release-bundle" &&
      artifact.path === "dist/release.txt",
  ),
);

console.log("Test 5 passed: Build artifact configured");

// TEST 6 — Deployment artifact download
assert.ok(
  jobs.deploy?.artifacts?.download?.some(
    (artifact) =>
      artifact.name === "release-bundle" &&
      artifact.fromJob === "build" &&
      artifact.path === "dist/release.txt",
  ),
);

assert.ok(jobs.deploy?.needs?.includes("build"));

console.log("Test 6 passed: Artifact transfer configured");

console.log("ALL DAY 7 WORKFLOW CONFIG TESTS PASSED!");
