import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { createWorkspace } from "../runner/workspace.js";
import { runProcess } from "../steps/process-runner.js";

const workspace = await createWorkspace();

try {
  // TEST 1: Run a command in a custom workspace.
  const result = await runProcess(
    ["-c", "printf 'hello-from-workspace' > marker.txt"],
    workspace,
  );

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.exitCode, 0);

  // The file must be created inside the workspace.
  const content = await readFile(join(workspace, "marker.txt"), "utf8");

  assert.equal(content, "hello-from-workspace");

  // TEST 2: Original behavior still works.
  const original = await runProcess(["-c", "echo original-behavior"]);

  assert.equal(original.status, "SUCCESS");
  assert.equal(original.stdout.trim(), "original-behavior");

  console.log("All ProcessRunner workspace tests passed!");
} finally {
  await rm(workspace, {
    recursive: true,
    force: true,
  });
}
