import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runStep } from "../steps/step-runner.js";

const workspace = await mkdtemp(join(tmpdir(), "ci-retry-step-"));

try {
  // Fails on first attempt, succeeds on second.
  const result = await runStep(
    {
      name: "Recover from temporary failure",
      run: `if [ -f marker.txt ]; then
        echo retry-success
      else
        touch marker.txt
        exit 1
      fi`,
      retries: 1,
    },
    workspace,
  );

  assert.equal(result.status, "SUCCESS");
  assert.match(result.stdout, /retry-success/);

  console.log("Test 1 passed: Step retries until success");

  // A fresh command without retries must fail.
  const noRetry = await runStep(
    {
      name: "No retry configured",
      run: "exit 1",
    },
    workspace,
  );

  assert.equal(noRetry.status, "FAILED");

  console.log("Test 2 passed: No retries by default");
  console.log("All Retry Step Integration tests passed!");
} finally {
  await rm(workspace, {
    recursive: true,
    force: true,
  });
}
