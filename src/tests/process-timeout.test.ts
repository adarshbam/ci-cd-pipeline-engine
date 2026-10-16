import assert from "node:assert/strict";
import { runProcess } from "../steps/process-runner.js";

// Test 1: A fast process must complete successfully.

{
  const result = await runProcess(
    ["-c", "echo timeout-test-ok"],
    undefined,
    2000,
  );

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /timeout-test-ok/);

  console.log("Test 1 passed: Fast process succeeds");
}

// Test 2: A long-running process must time out.

{
  const startedAt = Date.now();

  const result = await runProcess(["-c", "sleep 8"], undefined, 300);

  const elapsed = Date.now() - startedAt;

  assert.equal(result.status, "FAILED");
  assert.match(result.stderr, /timed out/i);

  assert.ok(elapsed < 6000, `Termination took too long: ${elapsed}ms`);

  console.log("Test 2 passed: Long-running process terminated");
}

// Test 3: A process with a child must terminate promptly.

{
  const startedAt = Date.now();

  const result = await runProcess(["-c", "sleep 8 & wait"], undefined, 300);

  const elapsed = Date.now() - startedAt;

  assert.equal(result.status, "FAILED");

  assert.ok(elapsed < 6000, `Child process may still be running: ${elapsed}ms`);

  console.log("Test 3 passed: Child-process cleanup completed");
}

// Test 4: No timeout preserves old behavior.

{
  const result = await runProcess(["-c", "echo legacy-process-ok"]);

  assert.equal(result.status, "SUCCESS");

  console.log("Test 4 passed: Legacy execution remains compatible");
}

console.log("All Process Timeout tests passed!");

import { mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Test 5: Background process must not survive timeout

const testDir = await mkdtemp(join(tmpdir(), "ci-timeout-marker-"));

try {
  const result = await runProcess(
    ["-c", "(sleep 2; echo survived > marker.txt) & wait"],
    testDir,
    200,
  );

  assert.equal(result.status, "FAILED");

  // Wait long enough for a surviving child to
  // create the marker file.
  await new Promise((resolve) => setTimeout(resolve, 2500));

  await assert.rejects(() => access(join(testDir, "marker.txt")), {
    code: "ENOENT",
  });

  console.log("Test 5 passed: Background process did not survive");
} finally {
  await rm(testDir, {
    recursive: true,
    force: true,
  });
}
