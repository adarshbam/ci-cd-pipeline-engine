import assert from "node:assert/strict";
import { runScript } from "../steps/script-runner.js";

const result = await runScript("scripts/test-runner.sh");

assert.equal(result.status, "SUCCESS");
assert.equal(result.exitCode, 0);
assert.equal(result.stdout.trim(), "Script execution successful");
assert.equal(result.stderr.trim(), "This is stderr");

const failed = await runScript("scripts/test-runner-fail.sh");

assert.equal(failed.status, "FAILED");
assert.equal(failed.exitCode, 1);
assert.equal(failed.stdout, "");
assert.equal(failed.stderr, "");

assert.ok(failed.startedAt instanceof Date);
assert.ok(failed.finishedAt instanceof Date);

const stderrResult = await runScript("scripts/test-runner-error.sh");
assert.equal(stderrResult.stdout, "");
assert.equal(stderrResult.stderr.trim(), "Something went wrong");

console.log("ScriptRunner tests passed!");
