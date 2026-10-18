import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow, JobRun, Step } from "../workflow/workflow.js";

// ----------------------------------------------------
// Test HTTP server
// ----------------------------------------------------

let healthy = true;
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

const directory = await mkdtemp(join(tmpdir(), "rollback-final-"));

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

function requireJob(jobs: Record<string, JobRun>, id: string): JobRun {
  const job = jobs[id];
  assert.ok(job, `Missing job: ${id}`);
  return job;
}

function setTrace(name: string): string {
  const path = join(directory, `${name}.txt`);
  process.env.ROLLBACK_TRACE_FILE = path;
  return path;
}

async function getTrace(path: string) {
  return readFile(path, "utf8");
}

// Append a letter to a file when the command executes.
function appendCommand(letter: string): string {
  return (
    "node -e \"require('node:fs')" +
    ".appendFileSync(process.env.ROLLBACK_TRACE_FILE," +
    ` '${letter}')"`
  );
}

// Append A and then deliberately fail.
const failingRollback =
  "node -e \"require('node:fs')" +
  ".appendFileSync(process.env.ROLLBACK_TRACE_FILE," +
  " 'A'); process.exit(1)\"";

interface Options {
  healthCheck?: boolean;
  rollback?: boolean;
  rollbackSteps?: Step[];
  deployCommand?: string;
}

function workflow(name: string, options: Options = {}): Workflow {
  const {
    healthCheck = true,
    rollback = true,
    rollbackSteps = [
      {
        name: "Restore A",
        run: appendCommand("A"),
      },
    ],
    deployCommand = "echo deployed",
  } = options;

  return {
    name,
    webhook: { url: `/test/${name}` },
    trigger: { events: ["push"] },

    environments: {
      test: { healthUrl },
    },

    jobs: {
      deploy: {
        healthCheck,

        ...(rollback ? { rollback: { steps: rollbackSteps } } : {}),

        steps: [
          {
            name: "Deploy",
            run: deployCommand,
          },
        ],
      },

      audit: {
        steps: [
          {
            name: "Independent audit",
            run: "echo audit-complete",
          },
        ],
      },

      afterDeploy: {
        needs: ["deploy"],
        steps: [
          {
            name: "Post-deployment",
            run: "echo post-deploy",
          },
        ],
      },
    },
  } as Workflow;
}

async function waitForRun(run: Awaited<ReturnType<PipelineEngine["run"]>>) {
  const deadline = Date.now() + 20_000;

  while (run.status !== "SUCCESS" && run.status !== "FAILED") {
    if (Date.now() >= deadline) {
      throw new Error("Pipeline timed out");
    }

    await sleep(25);
  }

  return run;
}

async function execute(workflowConfig: Workflow) {
  const engine = new PipelineEngine(workflowConfig);
  const run = await engine.run("develop");
  return waitForRun(run);
}

// ----------------------------------------------------
// Final integration tests
// ----------------------------------------------------

try {
  // TEST 1 — Healthy deployment
  {
    healthy = true;
    const trace = setTrace("healthy");

    const run = await execute(workflow("rollback-final-healthy"));

    const deploy = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "SUCCESS");
    assert.equal(deploy.status, "SUCCESS");
    assert.equal(deploy.failureReason, undefined);
    assert.equal(deploy.rollbackResult, undefined);

    assert.equal(requireJob(run.jobs, "afterDeploy").status, "SUCCESS");

    assert.equal(existsSync(trace), false);

    console.log("Test 1 passed: Healthy deployment skips rollback");
  }

  // TEST 2 — Sequential rollback steps
  {
    healthy = false;
    const trace = setTrace("sequential");

    const run = await execute(
      workflow("rollback-final-sequential", {
        rollbackSteps: [
          {
            name: "Restore A",
            run: appendCommand("A"),
          },
          {
            name: "Restore B",
            run: appendCommand("B"),
          },
        ],
      }),
    );

    const deploy = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "FAILED");
    assert.equal(deploy.status, "FAILED");

    assert.match(deploy.failureReason ?? "", /health/i);

    assert.equal(deploy.rollbackResult?.status, "SUCCESS");

    // Proves BOTH commands executed in order.
    assert.equal(await getTrace(trace), "AB");

    assert.equal(requireJob(run.jobs, "audit").status, "SUCCESS");

    assert.equal(requireJob(run.jobs, "afterDeploy").status, "SKIPPED");

    console.log("Test 2 passed: Rollback steps execute in order");
  }

  // TEST 3 — Failed rollback stops subsequent steps
  {
    healthy = false;
    const trace = setTrace("failure-stop");

    const run = await execute(
      workflow("rollback-final-failure", {
        rollbackSteps: [
          {
            name: "Failed restore",
            run: failingRollback,
          },
          {
            name: "Must never execute",
            run: appendCommand("B"),
          },
        ],
      }),
    );

    const deploy = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "FAILED");

    assert.match(deploy.failureReason ?? "", /health/i);

    assert.equal(deploy.rollbackResult?.status, "FAILED");

    assert.ok(deploy.rollbackResult?.error);

    // Only the first command should have run.
    assert.equal(await getTrace(trace), "A");

    console.log("Test 3 passed: Failed rollback stops later steps");
  }

  // TEST 4 — Deployment command fails
  {
    healthy = true;
    const trace = setTrace("command-failure");
    const before = healthRequests;

    const run = await execute(
      workflow("rollback-final-command", {
        deployCommand: "exit 1",
      }),
    );

    const deploy = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "FAILED");
    assert.equal(deploy.status, "FAILED");

    assert.ok(deploy.failureReason);
    assert.equal(deploy.rollbackResult, undefined);

    assert.equal(existsSync(trace), false);
    assert.equal(healthRequests, before);

    console.log("Test 4 passed: Command failure skips rollback");
  }

  // TEST 5 — Rollback is optional
  {
    healthy = false;
    const trace = setTrace("optional");

    const run = await execute(
      workflow("rollback-final-optional", {
        rollback: false,
      }),
    );

    const deploy = requireJob(run.jobs, "deploy");

    assert.equal(run.status, "FAILED");
    assert.equal(deploy.status, "FAILED");

    assert.match(deploy.failureReason ?? "", /health/i);

    assert.equal(deploy.rollbackResult, undefined);
    assert.equal(existsSync(trace), false);

    console.log("Test 5 passed: Missing rollback remains compatible");
  }

  // TEST 6 — Independent pipeline recovery
  {
    healthy = false;
    const firstTrace = setTrace("first-run");

    const engine = new PipelineEngine(workflow("rollback-final-recovery"));

    const first = await waitForRun(await engine.run("develop"));

    const firstJob = requireJob(first.jobs, "deploy");

    assert.equal(first.status, "FAILED");
    assert.equal(firstJob.rollbackResult?.status, "SUCCESS");

    assert.equal(await getTrace(firstTrace), "A");

    // Service recovers for the next pipeline run.
    healthy = true;
    const secondTrace = setTrace("second-run");

    const second = await waitForRun(await engine.run("develop"));

    const secondJob = requireJob(second.jobs, "deploy");

    assert.notEqual(first.id, second.id);

    assert.equal(second.status, "SUCCESS");
    assert.equal(secondJob.status, "SUCCESS");

    assert.equal(secondJob.failureReason, undefined);

    assert.equal(secondJob.rollbackResult, undefined);

    assert.equal(existsSync(secondTrace), false);

    // Previous failed run must remain unchanged.
    assert.equal(first.status, "FAILED");
    assert.equal(firstJob.status, "FAILED");

    assert.equal(firstJob.rollbackResult?.status, "SUCCESS");

    console.log("Test 6 passed: Independent runs recover correctly");
  }

  console.log("All Final Rollback Integration tests passed!");
} finally {
  delete process.env.ROLLBACK_TRACE_FILE;

  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  await rm(directory, {
    recursive: true,
    force: true,
  });
}
