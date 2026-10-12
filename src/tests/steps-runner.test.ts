import assert from "node:assert/strict";
import { runSteps } from "../steps/steps-runner.js";
import type { Step } from "../workflow/workflow.js";

// TEST 1: All steps execute in order.

const successSteps: Step[] = [
  {
    name: "First",
    run: "echo first",
  },
  {
    name: "Second",
    script: "scripts/test-runner.sh",
  },
  {
    name: "Third",
    run: "echo third",
  },
];

const successResults = await runSteps(successSteps);

assert.equal(successResults.length, 3);

assert.deepEqual(
  successResults.map((r) => r.status),
  ["SUCCESS", "SUCCESS", "SUCCESS"],
);

assert.equal(successResults[0]!.stdout.trim(), "first");
assert.equal(successResults[1]!.stdout.trim(), "Script execution successful");
assert.equal(successResults[2]!.stdout.trim(), "third");

// Verify sequential execution using timestamps.
assert.ok(
  successResults[0]!.finishedAt.getTime() <=
    successResults[1]!.startedAt.getTime(),
);

assert.ok(
  successResults[1]!.finishedAt.getTime() <=
    successResults[2]!.startedAt.getTime(),
);

// TEST 2: Execution stops on failure.

const failureSteps: Step[] = [
  {
    name: "Before failure",
    run: "echo ready",
  },
  {
    name: "Fail intentionally",
    run: "exit 7",
  },
  {
    name: "Must not execute",
    run: "echo SHOULD_NOT_RUN",
  },
];

const failureResults = await runSteps(failureSteps);

// Only first two steps should execute.
assert.equal(failureResults.length, 2);

assert.equal(failureResults[0]!.status, "SUCCESS");
assert.equal(failureResults[0]!.stdout.trim(), "ready");

assert.equal(failureResults[1]!.status, "FAILED");
assert.equal(failureResults[1]!.exitCode, 7);

// TEST 3: Empty steps array.

const emptyResults = await runSteps([]);

assert.deepEqual(emptyResults, []);

console.log("All sequential step execution tests passed!");
