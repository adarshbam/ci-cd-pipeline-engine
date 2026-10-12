import assert from "node:assert/strict";
import { access } from "node:fs/promises";

import { executeStepsInWorkspace } from "../runner/job-runner.js";
import type { Step } from "../workflow/workflow.js";

// TEST 1 — Commands and scripts work together.

const buildJob: { steps: Step[] } = {
  steps: [
    {
      name: "Find workspace",
      run: "node -p 'process.cwd()'",
    },
    {
      name: "Create build artifact and script",
      run: "printf 'BUILD_OK' > artifact.txt; printf 'cat artifact.txt' > verify.sh",
    },
    {
      name: "Execute verification script",
      script: "verify.sh",
    },
  ],
};

const buildResults = await executeStepsInWorkspace(buildJob.steps);

assert.equal(buildResults.length, 3);

assert.deepEqual(
  buildResults.map((result) => result.status),
  ["SUCCESS", "SUCCESS", "SUCCESS"],
);

assert.equal(buildResults[2]!.stdout.trim(), "BUILD_OK");

// Workspace must have been removed.
const buildWorkspace = buildResults[0]!.stdout.trim();

assert.notEqual(buildWorkspace, process.cwd());

await assert.rejects(access(buildWorkspace), { code: "ENOENT" });

// TEST 2 — Stop execution after failure.

const failedResults = await executeStepsInWorkspace([
  {
    name: "Locate workspace",
    run: "node -p 'process.cwd()'",
  },
  {
    name: "Intentional failure",
    run: "exit 5",
  },
  {
    name: "Must not execute",
    run: "echo SHOULD_NOT_RUN",
  },
]);

assert.equal(failedResults.length, 2);
assert.equal(failedResults[0]!.status, "SUCCESS");
assert.equal(failedResults[1]!.status, "FAILED");
assert.equal(failedResults[1]!.exitCode, 5);

// Cleanup must happen even after a failed step.
await assert.rejects(access(failedResults[0]!.stdout.trim()), {
  code: "ENOENT",
});

// TEST 3 — Concurrent jobs receive different workspaces.

function createTestJob(label: string): Step[] {
  return [
    {
      name: "Locate workspace",
      run: "node -p 'process.cwd()'",
    },
    {
      name: "Write artifact",
      run: `printf '${label}' > shared.txt`,
    },
    {
      name: "Read artifact",
      run: "cat shared.txt",
    },
  ];
}

const [jobA, jobB] = await Promise.all([
  executeStepsInWorkspace(createTestJob("A")),
  executeStepsInWorkspace(createTestJob("B")),
]);

assert.notEqual(jobA[0]!.stdout.trim(), jobB[0]!.stdout.trim());

assert.equal(jobA[2]!.stdout.trim(), "A");
assert.equal(jobB[2]!.stdout.trim(), "B");

assert.ok(jobA.every((result) => result.status === "SUCCESS"));
assert.ok(jobB.every((result) => result.status === "SUCCESS"));

// Both workspaces must be cleaned up.
await assert.rejects(access(jobA[0]!.stdout.trim()), { code: "ENOENT" });

await assert.rejects(access(jobB[0]!.stdout.trim()), { code: "ENOENT" });

console.log("All Day 2 integration tests passed!");
