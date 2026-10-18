import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeRollbackSteps } from "../rollback/rollback-steps.js";
import type { RollbackConfig } from "../workflow/workflow.js";

// TEST 1 — Successful command rollback
{
  const result = await executeRollbackSteps({
    steps: [
      {
        name: "Restore previous version",
        run: "echo restored",
      },
    ],
  });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.error, undefined);
  assert.ok(result.durationMs >= 0);

  console.log("Test 1 passed: Command rollback succeeds");
}

// TEST 2 — Multiple rollback steps succeed
{
  const result = await executeRollbackSteps({
    steps: [
      {
        name: "Restore files",
        run: "echo restoring-files",
      },
      {
        name: "Restart application",
        run: "echo restarting-app",
      },
      {
        name: "Finish rollback",
        run: "echo rollback-completed",
      },
    ],
  });

  assert.equal(result.status, "SUCCESS");

  console.log("Test 2 passed: Multiple rollback steps");
}

// TEST 3 — Failed command fails rollback
{
  const result = await executeRollbackSteps({
    steps: [
      {
        name: "Restore broken deployment",
        run: "exit 1",
      },
    ],
  });

  assert.equal(result.status, "FAILED");
  assert.ok(result.error);
  assert.ok(result.durationMs >= 0);

  console.log("Test 3 passed: Failed rollback recorded");
}

// TEST 4 — Failed step stops later execution
{
  const result = await executeRollbackSteps({
    steps: [
      {
        name: "First rollback step",
        run: "exit 1",
      },
      {
        name: "Should not execute",
        run: "echo should-not-run",
      },
    ],
  });

  assert.equal(result.status, "FAILED");

  console.log("Test 4 passed: Rollback stops on failure");
}

// TEST 5 — Rollback scripts are supported
{
  const directory = await mkdtemp(join(tmpdir(), "rollback-script-test-"));

  const scriptPath = join(directory, "restore.sh");

  try {
    await writeFile(scriptPath, "echo script-rollback-success\n", "utf8");

    const result = await executeRollbackSteps({
      steps: [
        {
          name: "Execute restore script",
          script: scriptPath,
        },
      ],
    });

    assert.equal(result.status, "SUCCESS");

    console.log("Test 5 passed: Script rollback succeeds");
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
}

// TEST 6 — Invalid configuration prevents execution
{
  const invalid = {
    steps: [
      {
        name: "Invalid rollback",
        run: "   ",
      },
    ],
  } as RollbackConfig;

  await assert.rejects(() => executeRollbackSteps(invalid));

  console.log("Test 6 passed: Invalid configuration rejected");
}

console.log("All Rollback Steps tests passed!");
