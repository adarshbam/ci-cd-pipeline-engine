import assert from "node:assert/strict";
import { runStep } from "../steps/step-runner.js";
import type { Step } from "../workflow/workflow.js";

// Test 1: Command step
const commandResult = await runStep({
  name: "Test command",
  run: "echo Hello",
});

// TODO: Verify stdout
assert.equal(commandResult.status, "SUCCESS");
assert.equal(commandResult.exitCode, 0);
assert.equal(commandResult.stdout.trim(), "Hello");
assert.equal(commandResult.stderr, "");

assert.ok(commandResult.startedAt instanceof Date);
assert.ok(commandResult.finishedAt instanceof Date);

// Test 2: Script step
// TODO: Execute scripts/test-runner.sh
// TODO: Verify status and stdout
const scriptResult = await runStep({
  name: "Test Script",
  script: "scripts/test-runner.sh",
});

assert.equal(scriptResult.status, "SUCCESS");
assert.equal(scriptResult.exitCode, 0);
assert.equal(scriptResult.stdout.trim(), "Script execution successful");
assert.equal(scriptResult.stderr.trim(), "This is stderr");

// Test 3: Invalid step
// TODO: Verify that runStep throws
const invalidStep = {} as Step;

await assert.rejects(
  () => runStep(invalidStep),
  /No run or script property exist in this step/,
);

console.log("All the step tests passed!");
