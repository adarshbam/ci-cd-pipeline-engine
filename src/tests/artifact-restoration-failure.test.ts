import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  initializeArtifactStorage,
  saveArtifact,
} from "../artifacts/artifact-manager.js";

import { withRestoredArtifact } from "../artifacts/artifact-workspace.js";

const runId = `test-${randomUUID()}`;

const testRoot = await mkdtemp(join(tmpdir(), "restoration-failure-test-"));

const storageRoot = await initializeArtifactStorage();

try {
  // =====================================
  // Scenario A: Artifact doesn't exist
  // =====================================

  let operationExecuted = false;

  await assert.rejects(() =>
    withRestoredArtifact(runId, "build", "missing-artifact", async () => {
      operationExecuted = true;
    }),
  );

  console.log("Test 1 passed: Missing artifact rejected");

  assert.equal(operationExecuted, false);

  console.log("Test 2 passed: Operation not executed");

  // =====================================
  // Scenario B: Operation throws
  // =====================================

  const sourceFile = join(testRoot, "build.txt");

  await writeFile(sourceFile, "Important build output");

  const storedPath = await saveArtifact(runId, "build", "output", sourceFile);

  let workspacePath = "";
  let restoredPath = "";

  await assert.rejects(
    () =>
      withRestoredArtifact(
        runId,
        "build",
        "output",
        async (workspace, restored) => {
          workspacePath = workspace;
          restoredPath = restored;

          const content = await readFile(restored, "utf8");

          assert.equal(content, "Important build output");

          throw new Error("Deployment operation failed");
        },
      ),
    /Deployment operation failed/,
  );

  console.log("Test 3 passed: Operation failure propagated");

  // The temporary workspace must be gone
  assert.ok(workspacePath);
  assert.ok(restoredPath);

  await assert.rejects(() => access(workspacePath), { code: "ENOENT" });

  await assert.rejects(() => access(restoredPath), { code: "ENOENT" });

  console.log("Test 4 passed: Failed workspace cleaned up");

  // The persistent artifact must be unchanged
  assert.equal(await readFile(storedPath, "utf8"), "Important build output");

  console.log("Test 5 passed: Stored artifact preserved");

  console.log("All Artifact Restoration Failure tests passed!");
} finally {
  await rm(testRoot, {
    recursive: true,
    force: true,
  });

  await rm(join(storageRoot, runId), {
    recursive: true,
    force: true,
  });
}
