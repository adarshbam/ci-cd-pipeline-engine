import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow, JobRun } from "../workflow/workflow.js";

// ======================================================
// TEST HELPERS
// ======================================================

let healthy = false;
let healthRequests = 0;

const server = createServer((_req, res) => {
  healthRequests++;

  res.writeHead(healthy ? 200 : 503);
  res.end(healthy ? "Healthy" : "Unavailable");
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address() as AddressInfo;
const healthUrl = `http://127.0.0.1:${address.port}/health`;

interface TestOptions {
  healthCheck?: boolean;
  includeRollback?: boolean;
  rollbackCommand?: string;
  deployCommand?: string;
}

function createWorkflow(name: string, options: TestOptions = {}): Workflow {
  const {
    healthCheck = true,
    includeRollback = true,
    rollbackCommand = "echo rollback-success",
    deployCommand = "echo deployment-success",
  } = options;

  return {
    name,
    webhook: {
      url: `/test/${name}`,
    },
    trigger: {
      events: ["push"],
    },
    environments: {
      test: {
        healthUrl,
      },
    },
    jobs: {
      deploy: {
        healthCheck,
        ...(includeRollback
          ? {
              rollback: {
                steps: [
                  {
                    name: "Restore previous version",
                    run: rollbackCommand,
                  },
                ],
              },
            }
          : {}),
        steps: [
          {
            name: "Deploy application",
            run: deployCommand,
          },
        ],
      },
      afterDeploy: {
        needs: ["deploy"],
        steps: [
          {
            name: "Post deployment",
            run: "echo post-deployment",
          },
        ],
      },
    },
  } as Workflow;
}

// Wait for an existing pipeline run to finish.
async function waitForCompletion(
  run: Awaited<ReturnType<PipelineEngine["run"]>>,
) {
  const deadline = Date.now() + 20_000;

  while (run.status !== "SUCCESS" && run.status !== "FAILED") {
    if (Date.now() >= deadline) {
      throw new Error("Pipeline did not finish within 20 seconds");
    }

    await sleep(25);
  }

  return run;
}

// Create an engine, start a run, and wait for completion.
async function startAndWait(workflow: Workflow) {
  const engine = new PipelineEngine(workflow);
  const run = await engine.run("develop");

  return waitForCompletion(run);
}

// IMPORTANT:
// Record<string, JobRun> does not guarantee a particular
// job ID exists. This helper checks it at runtime and
// returns a properly narrowed JobRun.
function requireJob(jobs: Record<string, JobRun>, jobId: string): JobRun {
  const job = jobs[jobId];

  assert.ok(job, `Expected job "${jobId}" to exist`);

  return job;
}

// ======================================================
// TEST CASES
// ======================================================

try {
  // ----------------------------------------------------
  // TEST 1 — Healthy deployment has no failure metadata
  // ----------------------------------------------------
  {
    healthy = true;

    const run = await startAndWait(createWorkflow("metadata-healthy"));

    const job = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "SUCCESS");
    assert.equal(job.status, "SUCCESS");

    assert.equal(job.failureReason, undefined);
    assert.equal(job.rollbackResult, undefined);

    console.log("Test 1 passed: Healthy deployment has no failure metadata");
  }

  // ----------------------------------------------------
  // TEST 2 — Successful rollback is recorded
  // ----------------------------------------------------
  {
    healthy = false;

    const run = await startAndWait(createWorkflow("metadata-rollback-success"));

    const job = requireJob(run.jobs, "deploy");
    const afterDeploy = requireJob(run.jobs, "afterDeploy");

    assert.equal(run.status, "FAILED");
    assert.equal(job.status, "FAILED");

    assert.match(
      job.failureReason ?? "",
      /health/i,
      "Original health failure must be recorded",
    );

    assert.equal(job.rollbackResult?.status, "SUCCESS");

    assert.ok(
      (job.rollbackResult?.durationMs ?? -1) >= 0,
      "Rollback duration must be recorded",
    );

    assert.equal(job.rollbackResult?.error, undefined);

    assert.equal(afterDeploy.status, "SKIPPED");

    console.log("Test 2 passed: Successful rollback result recorded");
  }

  // ----------------------------------------------------
  // TEST 3 — Failed rollback preserves BOTH failures
  // ----------------------------------------------------
  {
    healthy = false;

    const run = await startAndWait(
      createWorkflow("metadata-rollback-failed", {
        rollbackCommand: "exit 1",
      }),
    );

    const job = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "FAILED");
    assert.equal(job.status, "FAILED");

    // Original health failure remains available.
    assert.match(job.failureReason ?? "", /health/i);

    // Rollback failure is recorded separately.
    assert.equal(job.rollbackResult?.status, "FAILED");

    assert.ok(
      job.rollbackResult?.error,
      "Rollback failure must contain an error",
    );

    assert.ok((job.rollbackResult?.durationMs ?? -1) >= 0);

    // Rollback failure must not overwrite the
    // original deployment health-check failure.
    assert.match(job.failureReason ?? "", /Deployment health check failed/i);

    console.log("Test 3 passed: Both failures preserved separately");
  }

  // ----------------------------------------------------
  // TEST 4 — No rollback configuration
  // ----------------------------------------------------
  {
    healthy = false;

    const run = await startAndWait(
      createWorkflow("metadata-no-rollback", {
        includeRollback: false,
      }),
    );

    const job = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "FAILED");
    assert.equal(job.status, "FAILED");

    assert.match(job.failureReason ?? "", /health/i);

    assert.equal(
      job.rollbackResult,
      undefined,
      "No rollback result should be invented",
    );

    console.log("Test 4 passed: Missing rollback config handled");
  }

  // ----------------------------------------------------
  // TEST 5 — Command failure recorded without rollback
  // ----------------------------------------------------
  {
    healthy = true;

    const previousRequests = healthRequests;

    const run = await startAndWait(
      createWorkflow("metadata-command-failed", {
        deployCommand: "exit 1",
      }),
    );

    const job = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "FAILED");
    assert.equal(job.status, "FAILED");

    assert.ok(
      typeof job.failureReason === "string" &&
        job.failureReason.trim().length > 0,
      "Command failure reason must be recorded",
    );

    assert.equal(
      job.rollbackResult,
      undefined,
      "Command failure must not trigger health rollback",
    );

    assert.equal(
      healthRequests,
      previousRequests,
      "Failed deployment command must skip health check",
    );

    console.log("Test 5 passed: Command failure recorded separately");
  }

  // ----------------------------------------------------
  // TEST 6 — Independent runs preserve their own metadata
  // ----------------------------------------------------
  {
    healthy = false;

    const engine = new PipelineEngine(createWorkflow("metadata-independent"));

    // First run fails and successfully rolls back.
    const firstRun = await waitForCompletion(await engine.run("develop"));

    const firstJob = requireJob(firstRun.jobs, "deploy");

    assert.equal(firstRun.status, "FAILED");
    assert.equal(firstJob.status, "FAILED");

    assert.match(firstJob.failureReason ?? "", /health/i);

    assert.equal(firstJob.rollbackResult?.status, "SUCCESS");

    // Application recovers before the second run.
    healthy = true;

    const secondRun = await waitForCompletion(await engine.run("develop"));

    const secondJob = requireJob(secondRun.jobs, "deploy");

    assert.notEqual(firstRun.id, secondRun.id);

    assert.equal(secondRun.status, "SUCCESS");
    assert.equal(secondJob.status, "SUCCESS");

    assert.equal(secondJob.failureReason, undefined);

    assert.equal(secondJob.rollbackResult, undefined);

    // Confirm the previous failed run was not mutated.
    assert.equal(firstRun.status, "FAILED");

    assert.match(firstJob.failureReason ?? "", /health/i);

    assert.equal(firstJob.rollbackResult?.status, "SUCCESS");

    console.log("Test 6 passed: Pipeline runs preserve independent metadata");
  }

  console.log("All Rollback Result Preservation tests passed!");
} finally {
  // Clean up HTTP connections and local test server.
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
