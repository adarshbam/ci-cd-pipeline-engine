import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withWorkspace } from "../runner/workspace.js";
import { runCommand } from "../steps/command-runner.js";

// TEST 1: Cleanup after success.

let successPath = "";

const output = await withWorkspace(async (cwd) => {
  successPath = cwd;

  const result = await runCommand("printf 'hello' > result.txt", cwd);

  assert.equal(result.status, "SUCCESS");

  return readFile(join(cwd, "result.txt"), "utf8");
});

assert.equal(output, "hello");

await assert.rejects(access(successPath), { code: "ENOENT" });

// TEST 2: Cleanup when operation throws.

let errorPath = "";

await assert.rejects(
  () =>
    withWorkspace(async (cwd) => {
      errorPath = cwd;

      await writeFile(join(cwd, "temporary.txt"), "temporary");

      throw new Error("Simulated execution failure");
    }),
  /Simulated execution failure/,
);

await assert.rejects(access(errorPath), { code: "ENOENT" });

// TEST 3: Cleanup after a failed command result.

let failedPath = "";

const failedResult = await withWorkspace(async (cwd) => {
  failedPath = cwd;
  return runCommand("exit 7", cwd);
});

assert.equal(failedResult.status, "FAILED");
assert.equal(failedResult.exitCode, 7);

await assert.rejects(access(failedPath), { code: "ENOENT" });

console.log("All workspace lifecycle tests passed!");
