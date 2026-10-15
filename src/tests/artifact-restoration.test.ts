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

import {
  saveArtifact,
  getArtifactPath,
  initializeArtifactStorage,
} from "../artifacts/artifact-manager.js";

import { withRestoredArtifact } from "../artifacts/artifact-workspace.js";

const runId = `test-${randomUUID()}`;
const testRoot = await mkdtemp(join(tmpdir(), "artifact-restoration-test-"));

const storageRoot = await initializeArtifactStorage();

let workspacePath = "";
let restoredPath = "";

try {
  // Prepare the original build output
  const dist = join(testRoot, "dist");

  await mkdir(join(dist, "assets"), {
    recursive: true,
  });

  await writeFile(join(dist, "index.html"), "<h1>Deployment Ready</h1>");

  await writeFile(join(dist, "assets", "app.js"), "console.log('deployed')");

  // Store the build artifact
  await saveArtifact(runId, "build", "frontend", dist);

  // Simulate deleting the original build workspace
  await rm(dist, {
    recursive: true,
    force: true,
  });

  // Restore into a new workspace
  const result = await withRestoredArtifact(
    runId,
    "build",
    "frontend",
    async (workspace, restored) => {
      workspacePath = workspace;
      restoredPath = restored;

      // Test 1: Files are available to the callback
      const html = await readFile(join(restored, "index.html"), "utf8");

      assert.equal(html, "<h1>Deployment Ready</h1>");

      const js = await readFile(join(restored, "assets", "app.js"), "utf8");

      assert.equal(js, "console.log('deployed')");

      console.log("Test 1 passed: Artifact restored before operation");

      // Test 2: Paths are constructed correctly
      assert.equal(restored, join(workspace, "artifacts", "frontend"));

      console.log("Test 2 passed: Correct workspace paths");

      // Test 3: Return a value from the callback
      return "Deployment completed";
    },
  );

  assert.equal(result, "Deployment completed");

  console.log("Test 3 passed: Generic callback return preserved");

  // Test 4: Temporary workspace was cleaned up
  await assert.rejects(() => access(workspacePath), { code: "ENOENT" });

  await assert.rejects(() => access(restoredPath), { code: "ENOENT" });

  console.log("Test 4 passed: Temporary workspace cleaned up");

  // Test 5: Persisted artifact is still accessible
  const storedPath = await getArtifactPath(runId, "build", "frontend");

  assert.equal(
    await readFile(join(storedPath, "index.html"), "utf8"),
    "<h1>Deployment Ready</h1>",
  );

  console.log("Test 5 passed: Stored artifact preserved");

  console.log("All Artifact Restoration tests passed!");
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
