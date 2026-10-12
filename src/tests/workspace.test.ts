import assert from "node:assert/strict";
import { stat, writeFile, readFile, access, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { createWorkspace } from "../runner/workspace.js";

const workspace1 = await createWorkspace();
let workspace2: string | undefined;

try {
  workspace2 = await createWorkspace();

  // Each run gets a different directory.
  assert.notEqual(workspace1, workspace2);

  // Both directories exist.
  assert.ok((await stat(workspace1)).isDirectory());
  assert.ok((await stat(workspace2)).isDirectory());

  // They are inside the OS temporary directory.
  assert.equal(dirname(workspace1), tmpdir());
  assert.equal(dirname(workspace2), tmpdir());

  // Names have the expected prefix.
  assert.ok(basename(workspace1).startsWith("ci-run-"));
  assert.ok(basename(workspace2).startsWith("ci-run-"));

  // Files created in one workspace
  // should not appear in another.
  await writeFile(join(workspace1, "test.txt"), "Hello");

  const content = await readFile(join(workspace1, "test.txt"), "utf8");

  assert.equal(content, "Hello");

  await assert.rejects(access(join(workspace2, "test.txt")), {
    code: "ENOENT",
  });

  console.log("All workspace creation tests passed!");
} finally {
  // Test cleanup, even if an assertion fails.
  await rm(workspace1, { recursive: true, force: true });

  if (workspace2) {
    await rm(workspace2, {
      recursive: true,
      force: true,
    });
  }
}
