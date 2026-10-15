import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  initializeArtifactStorage,
  getArtifactPath,
  saveArtifact,
  restoreArtifact,
} from "../artifacts/artifact-manager.js";

const testRoot = await mkdtemp(join(tmpdir(), "artifact-manager-test-"));

const runA = `test-${randomUUID()}`;
const runB = `test-${randomUUID()}`;

const storageRoot = await initializeArtifactStorage();

try {
  // Test 1: Storage initialization is reusable
  const rootAgain = await initializeArtifactStorage();

  assert.equal(rootAgain, storageRoot);
  assert.equal((await stat(storageRoot)).isDirectory(), true);

  console.log("Test 1 passed: Storage initialization");

  // Test 2: Unique artifact paths
  const pathA = await getArtifactPath(runA, "build", "output");
  const pathB = await getArtifactPath(runB, "build", "output");
  const pathC = await getArtifactPath(runA, "test", "output");

  assert.notEqual(pathA, pathB);
  assert.notEqual(pathA, pathC);

  assert.equal(pathA, join(storageRoot, runA, "build", "output"));

  console.log("Test 2 passed: Artifact path isolation");

  // Test 3: Save a file without modifying the source
  const sourceFile = join(testRoot, "output.txt");
  await writeFile(sourceFile, "Build completed!");

  const savedPath = await saveArtifact(runA, "build", "output", sourceFile);

  assert.equal(await readFile(savedPath, "utf8"), "Build completed!");

  assert.equal(await readFile(sourceFile, "utf8"), "Build completed!");

  console.log("Test 3 passed: File artifact saved");

  // Test 4: Restore after the original is deleted
  await rm(sourceFile);

  const restoredFile = join(testRoot, "new-workspace", "output.txt");

  await restoreArtifact(runA, "build", "output", restoredFile);

  assert.equal(await readFile(restoredFile, "utf8"), "Build completed!");

  console.log("Test 4 passed: File artifact restored");

  // Test 5: Directory artifacts preserve nested files
  const dist = join(testRoot, "dist");
  await mkdir(join(dist, "assets"), { recursive: true });

  await writeFile(join(dist, "index.html"), "<h1>Hello</h1>");
  await writeFile(join(dist, "assets", "app.js"), "console.log(1)");

  await saveArtifact(runA, "build", "frontend", dist);

  await rm(dist, { recursive: true, force: true });

  const restoredDist = join(testRoot, "deploy", "dist");

  await restoreArtifact(runA, "build", "frontend", restoredDist);

  assert.equal(
    await readFile(join(restoredDist, "index.html"), "utf8"),
    "<h1>Hello</h1>",
  );

  assert.equal(
    await readFile(join(restoredDist, "assets", "app.js"), "utf8"),
    "console.log(1)",
  );

  console.log("Test 5 passed: Directory artifact restored");

  // Test 6: Reject invalid artifact identifiers
  for (const invalid of [
    "",
    ".",
    "..",
    "../secret",
    "bad/name",
    "bad\\name",
    "name with spaces",
  ]) {
    await assert.rejects(
      () => getArtifactPath(runA, "build", invalid),
      `Expected rejection for: ${JSON.stringify(invalid)}`,
    );
  }

  await assert.rejects(() => getArtifactPath("../escape", "build", "output"));

  console.log("Test 6 passed: Invalid identifiers rejected");

  // Test 7: Missing artifacts reject restoration
  await assert.rejects(() =>
    restoreArtifact(
      runA,
      "build",
      "does-not-exist",
      join(testRoot, "missing.txt"),
    ),
  );

  console.log("Test 7 passed: Missing artifact rejected");

  // Test 8: Existing files cannot be overwritten
  const anotherFile = join(testRoot, "another.txt");
  await writeFile(anotherFile, "Different content");

  await assert.rejects(() =>
    saveArtifact(runA, "build", "output", anotherFile),
  );

  assert.equal(await readFile(savedPath, "utf8"), "Build completed!");

  console.log("Test 8 passed: File overwrite prevented");

  // Test 9: Existing empty directories cannot be reused
  const emptyDir = join(testRoot, "empty-artifact");
  await mkdir(emptyDir);

  await saveArtifact(runA, "build", "empty-folder", emptyDir);

  await assert.rejects(() =>
    saveArtifact(runA, "build", "empty-folder", emptyDir),
  );

  console.log("Test 9 passed: Directory collision prevented");

  console.log("All Artifact Manager tests passed!");
} finally {
  await rm(testRoot, { recursive: true, force: true });

  // Remove only the unique test run folders.
  // Never delete the entire artifact storage root.
  await rm(join(storageRoot, runA), {
    recursive: true,
    force: true,
  });

  await rm(join(storageRoot, runB), {
    recursive: true,
    force: true,
  });
}
