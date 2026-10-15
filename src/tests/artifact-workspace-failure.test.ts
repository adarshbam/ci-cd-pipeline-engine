import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { buildAndStoreArtifact } from "../artifacts/artifact-workspace.js";
import {
  getArtifactPath,
  initializeArtifactStorage,
} from "../artifacts/artifact-manager.js";

const runId = `test-${randomUUID()}`;
const storageRoot = await initializeArtifactStorage();

let workspacePath = "";

try {
  // Test 1: The build error propagates
  await assert.rejects(
    () =>
      buildAndStoreArtifact(runId, "build", "frontend", async (workspace) => {
        workspacePath = workspace;

        const dist = join(workspace, "dist");
        await mkdir(dist, { recursive: true });
        await writeFile(join(dist, "index.html"), "Incomplete build");

        throw new Error("Build failed");
      }),
    /Build failed/,
  );

  console.log("Test 1 passed: Build failure propagated");

  // Test 2: Workspace is removed despite the error
  assert.ok(workspacePath);

  await assert.rejects(() => access(workspacePath), { code: "ENOENT" });

  console.log("Test 2 passed: Failed workspace cleaned up");

  // Test 3: Failed build does not produce an artifact
  const artifactPath = await getArtifactPath(runId, "build", "frontend");

  await assert.rejects(() => access(artifactPath), { code: "ENOENT" });

  console.log("Test 3 passed: No artifact saved after failure");

  console.log("All Artifact Failure Lifecycle tests passed!");
} finally {
  await rm(join(storageRoot, runId), {
    recursive: true,
    force: true,
  });
}
