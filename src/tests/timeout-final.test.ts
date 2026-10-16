import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { runStep } from "../steps/step-runner.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const workspace = await mkdtemp(join(tmpdir(), "ci-timeout-final-"));

try {
  // =====================================
  // TEST 1: Script timeout
  // =====================================

  await writeFile(join(workspace, "slow.sh"), "sleep 5\n", "utf8");

  const scriptResult = await runStep(
    {
      name: "Slow script",
      script: "./slow.sh",
      timeoutMs: 300,
    },
    workspace,
  );

  assert.equal(scriptResult.status, "FAILED");
  assert.match(scriptResult.stderr, /timed out/i);

  console.log("Test 1 passed: Script timeout enforced");

  // =====================================
  // TEST 2: Full pipeline timeout
  // =====================================

  const workflow: Workflow = {
    name: "pipeline-timeout-test",
    webhook: {
      url: "/test/pipeline-timeout",
    },
    trigger: {
      events: ["push"],
    },
    jobs: {
      build: {
        steps: [
          {
            name: "Long build",
            run: "sleep 5",
            timeoutMs: 300,
          },
        ],
      },

      deploy: {
        needs: ["build"],
        steps: [
          {
            name: "Deploy",
            run: "echo should-not-deploy",
          },
        ],
      },
    },
  };

  const engine = new PipelineEngine(workflow);
  const run = await engine.run();

  const deadline = Date.now() + 15_000;

  while (
    run.status !== "SUCCESS" &&
    run.status !== "FAILED" &&
    Date.now() < deadline
  ) {
    await sleep(100);
  }

  assert.equal(run.status, "FAILED", "Pipeline must fail when build times out");

  assert.equal(run.jobs["build"]?.status, "FAILED");

  assert.equal(
    run.jobs["deploy"]?.status,
    "SKIPPED",
    "Deploy must be skipped after build failure",
  );

  console.log("Test 2 passed: Pipeline propagates timeout failure");

  console.log("All Final Timeout tests passed!");
} finally {
  await rm(workspace, {
    recursive: true,
    force: true,
  });
}
