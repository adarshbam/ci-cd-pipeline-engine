import assert from "node:assert/strict";
import { runCommand } from "../steps/command-runner.js";

const result = await runCommand("echo Hello World");

assert.equal(result.status, "SUCCESS");
assert.equal(result.exitCode, 0);
assert.equal(result.stdout.trim(), "Hello World");
assert.equal(result.stderr, "");

assert.ok(result.startedAt instanceof Date);
assert.ok(result.finishedAt instanceof Date);

const failed = await runCommand("exit 1");

assert.equal(failed.status, "FAILED");
assert.equal(failed.exitCode, 1);
assert.equal(failed.stdout, "");
assert.equal(failed.stderr, "");

assert.ok(failed.startedAt instanceof Date);
assert.ok(failed.finishedAt instanceof Date);

const stderrResult = await runCommand("echo Something went wrong >&2");
assert.equal(stderrResult.stdout, "");
assert.equal(stderrResult.stderr.trim(), "Something went wrong");

console.log("All CommandRunner tests passed!");
