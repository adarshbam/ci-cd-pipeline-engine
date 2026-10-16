import assert from "node:assert/strict";
import { mkdtemp, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runStep } from "../steps/step-runner.js";
import { runSteps } from "../steps/steps-runner.js";
import type { Step } from "../workflow/workflow.js";

const workspace = await mkdtemp(join(tmpdir(), "ci-retry-failure-"));

async function countAttempts(filename: string): Promise<number> {
  const content = await readFile(join(workspace, filename), "utf8");

  return content.trim().split(/\r?\n/).length;
}

try {
  // ============================================
  // TEST 1 — Retry limit is respected
  // ============================================

  const alwaysFail: Step = {
    name: "Always failing step",
    run: "echo attempt >> fail-attempts.txt; exit 1",
    retries: 2,
  };

  const failedResult = await runStep(alwaysFail, workspace);

  assert.equal(failedResult.status, "FAILED");

  assert.equal(
    await countAttempts("fail-attempts.txt"),
    3,
    "Expected one initial attempt and two retries",
  );

  console.log("Test 1 passed: Retry limit respected");

  // ============================================
  // TEST 2 — Failure stops subsequent steps
  // ============================================

  const failingSteps: Step[] = [
    {
      name: "Preparation",
      run: "echo prepared",
    },
    {
      name: "Failing build",
      run: "echo attempt >> build-attempts.txt; exit 1",
      retries: 1,
    },
    {
      name: "Should never run",
      run: "echo deployed > deployed.txt",
    },
  ];

  const results = await runSteps(failingSteps, workspace);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.status, "SUCCESS");
  assert.equal(results[1]?.status, "FAILED");

  assert.equal(await countAttempts("build-attempts.txt"), 2);

  await assert.rejects(() => access(join(workspace, "deployed.txt")), {
    code: "ENOENT",
  });

  console.log("Test 2 passed: Failure stops subsequent steps");

  // ============================================
  // TEST 3 — Recovery allows subsequent steps
  // ============================================

  const recoveringSteps: Step[] = [
    {
      name: "Recovering build",
      run: `
        echo attempt >> recovery-attempts.txt
        count=$(wc -l < recovery-attempts.txt)

        if [ "$count" -lt 3 ]; then
          exit 1
        fi

        echo recovered
      `,
      retries: 2,
    },
    {
      name: "Deploy after recovery",
      run: "echo deployed-after-recovery",
    },
  ];

  const recoveryResults = await runSteps(recoveringSteps, workspace);

  assert.equal(recoveryResults.length, 2);
  assert.equal(recoveryResults[0]?.status, "SUCCESS");
  assert.equal(recoveryResults[1]?.status, "SUCCESS");

  assert.equal(await countAttempts("recovery-attempts.txt"), 3);

  assert.match(recoveryResults[1]!.stdout, /deployed-after-recovery/);

  console.log("Test 3 passed: Recovery continues execution");

  // ============================================
  // TEST 4 — Invalid retries fail before execution
  // ============================================

  const invalidStep: Step = {
    name: "Invalid retry configuration",
    run: "echo executed > invalid-execution.txt",
    retries: -1,
  };

  await assert.rejects(() => runStep(invalidStep, workspace), Error);

  await assert.rejects(() => access(join(workspace, "invalid-execution.txt")), {
    code: "ENOENT",
  });

  console.log("Test 4 passed: Invalid retries rejected before execution");

  console.log("All Retry Failure Propagation tests passed!");
} finally {
  await rm(workspace, {
    recursive: true,
    force: true,
  });
}
