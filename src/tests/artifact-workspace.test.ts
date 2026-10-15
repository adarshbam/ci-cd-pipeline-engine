import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAndStoreArtifact } from "../artifacts/artifact-workspace.js";
import { initializeArtifactStorage } from "../artifacts/artifact-manager.js";

const runId = `test-${randomUUID()}`;
const testRoot = await mkdtemp(join(tmpdir(), "artifact-lifecycle-"));

const storageRoot = await initializeArtifactStorage();

let workspacePath = "";

try {
  const savedPath = await buildAndStoreArtifact(
    runId,
    "build",
    "frontend",
    async (workspace) => {
      workspacePath = workspace;

      const dist = join(workspace, "dist");
      await mkdir(dist, { recursive: true });
      await writeFile(join(dist, "index.html"), "<h1>Built!</h1>");

      return dist;
    },
  );

  // Test 1: Artifact contents were saved
  assert.equal(
    await readFile(join(savedPath, "index.html"), "utf8"),
    "<h1>Built!</h1>",
  );

  console.log("Test 1 passed: Generated artifact saved");

  // Test 2: Temporary workspace has been deleted
  await assert.rejects(() => access(workspacePath), { code: "ENOENT" });

  console.log("Test 2 passed: Workspace cleaned up");

  // Test 3: Persistent artifact remains accessible
  await access(savedPath);

  console.log("Test 3 passed: Artifact survived cleanup");

  console.log("All Artifact Lifecycle tests passed!");
} finally {
  await rm(testRoot, { recursive: true, force: true });
  await rm(join(storageRoot, runId), {
    recursive: true,
    force: true,
  });
}
