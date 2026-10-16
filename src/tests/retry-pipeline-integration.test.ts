import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

// Wait for the background pipeline scheduler.
async function startAndWait(engine: PipelineEngine) {
  const run = await engine.run();
  const deadline = Date.now() + 15_000;

  while (
    run.status !== "SUCCESS" &&
    run.status !== "FAILED" &&
    Date.now() < deadline
  ) {
    await sleep(100);
  }

  assert.ok(
    run.status === "SUCCESS" || run.status === "FAILED",
    "Pipeline did not finish within 15 seconds",
  );

  return run;
}

// =========================================
// WORKFLOW A — Build recovers on retry
// =========================================

const recoveryWorkflow: Workflow = {
  name: "retry-recovery",
  webhook: { url: "/test/retry-recovery" },
  trigger: { events: ["push"] },

  jobs: {
    build: {
      steps: [
        {
          name: "Recovering build",
          run: `
            if [ -f retry-marker.txt ]; then
              echo build-recovered
            else
              touch retry-marker.txt
              exit 1
            fi
          `,
          retries: 1,
        },
      ],
    },

    deploy: {
      needs: ["build"],
      steps: [
        {
          name: "Deploy",
          run: "echo deployment-success",
        },
      ],
    },
  },
};

// =========================================
// WORKFLOW B — Build always fails
// =========================================

const failureWorkflow: Workflow = {
  name: "retry-exhaustion",
  webhook: { url: "/test/retry-exhaustion" },
  trigger: { events: ["push"] },

  jobs: {
    build: {
      steps: [
        {
          name: "Always failing build",
          run: "exit 1",
          retries: 2,
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

// =========================================
// TEST 1 — Pipeline recovers successfully
// =========================================

const recoveryEngine = new PipelineEngine(recoveryWorkflow);

const recovered = await startAndWait(recoveryEngine);

assert.equal(recovered.status, "SUCCESS");
assert.equal(recovered.jobs.build?.status, "SUCCESS");
assert.equal(recovered.jobs.deploy?.status, "SUCCESS");

console.log("Test 1 passed: Pipeline recovers after retry");

// =========================================
// TEST 2 — Exhausted retries fail pipeline
// =========================================

const failureEngine = new PipelineEngine(failureWorkflow);

const failed = await startAndWait(failureEngine);

assert.equal(failed.status, "FAILED");
assert.equal(failed.jobs.build?.status, "FAILED");
assert.equal(failed.jobs.deploy?.status, "SKIPPED");

console.log("Test 2 passed: Exhausted retries fail pipeline");

// =========================================
// TEST 3 — Different runs remain independent
// =========================================

const secondRecovered = await startAndWait(recoveryEngine);

assert.notEqual(secondRecovered.id, recovered.id);

assert.equal(secondRecovered.status, "SUCCESS");
assert.equal(secondRecovered.jobs.build?.status, "SUCCESS");
assert.equal(secondRecovered.jobs.deploy?.status, "SUCCESS");

console.log("Test 3 passed: Independent pipeline runs");

console.log("All Retry Pipeline Integration tests passed!");
