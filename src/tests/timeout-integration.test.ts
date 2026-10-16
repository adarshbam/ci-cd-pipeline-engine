import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "../steps/command-runner.js";
import { runStep } from "../steps/step-runner.js";
import { runSteps } from "../steps/steps-runner.js";
import type { Step } from "../workflow/workflow.js";

const workspace = await mkdtemp(join(tmpdir(), "ci-timeout-integration-"));

try {
  // TEST 1: Fast command with timeout
  {
    const result = await runCommand("echo command-success", workspace, 2000);

    assert.equal(result.status, "SUCCESS");
    assert.match(result.stdout, /command-success/);

    console.log("Test 1 passed: Command completes before timeout");
  }

  // TEST 2: Command runner enforces timeout
  {
    const startedAt = Date.now();

    const result = await runCommand("sleep 5", workspace, 250);

    const elapsed = Date.now() - startedAt;

    assert.equal(result.status, "FAILED");
    assert.match(result.stderr, /timed out/i);

    assert.ok(elapsed < 4000, `Command timeout took ${elapsed}ms`);

    console.log("Test 2 passed: Command runner enforces timeout");
  }

  // TEST 3: Step runner forwards timeout
  {
    const step: Step = {
      name: "Timed build",
      run: "sleep 5",
      timeoutMs: 250,
    };

    const result = await runStep(step, workspace);

    assert.equal(result.status, "FAILED");
    assert.match(result.stderr, /timed out/i);

    console.log("Test 3 passed: Step runner forwards timeout");
  }

  // TEST 4: Sequential execution stops after failure
  {
    const steps: Step[] = [
      {
        name: "First step",
        run: "echo first-step",
        timeoutMs: 2000,
      },
      {
        name: "Timed-out step",
        run: "sleep 5",
        timeoutMs: 250,
      },
      {
        name: "Should not execute",
        run: "echo should-not-run",
      },
    ];

    const results = await runSteps(steps, workspace);

    assert.equal(results.length, 2);
    assert.equal(results[0]?.status, "SUCCESS");
    assert.equal(results[1]?.status, "FAILED");

    assert.ok(
      !results.some((result) => result.stdout.includes("should-not-run")),
      "Execution should stop after timeout failure",
    );

    console.log("Test 4 passed: Timeout stops subsequent steps");
  }

  // TEST 5: No timeout preserves legacy behavior
  {
    const step: Step = {
      name: "Legacy step",
      run: "echo legacy-ok",
    };

    const result = await runStep(step, workspace);

    assert.equal(result.status, "SUCCESS");
    assert.match(result.stdout, /legacy-ok/);

    console.log("Test 5 passed: Legacy step remains compatible");
  }

  // TEST 6: Normal command failure is not a timeout
  {
    const result = await runCommand("exit 1", workspace, 5000);

    assert.equal(result.status, "FAILED");
    assert.doesNotMatch(result.stderr, /timed out/i);

    console.log("Test 6 passed: Normal failure distinguished from timeout");
  }

  console.log("All Timeout Integration tests passed!");
} finally {
  await rm(workspace, {
    recursive: true,
    force: true,
  });
}
