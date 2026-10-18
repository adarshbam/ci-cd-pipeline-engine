import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import { executeJob } from "../scheduler/job-executor.js";
import { readLogEntries } from "../logging/log-reader.js";
import type { ExecutionLogEntry } from "../logging/log-entry.js";
import type { Workflow, PipelineRun } from "../workflow/workflow.js";

// ------------------------------------------------------
// LOCAL HEALTH SERVER
// ------------------------------------------------------

let healthRequests = 0;

const server = createServer((req, res) => {
  healthRequests++;

  if (req.url === "/healthy") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  res.writeHead(503);
  res.end("Service unavailable");
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

const createdRunIds: string[] = [];

interface ScenarioOptions {
  healthPath?: "/healthy" | "/unhealthy";
  command?: string;
  rollbackCommand?: string;
  healthCheck?: boolean;
}

function createWorkflow(name: string, options: ScenarioOptions = {}): Workflow {
  const healthUrl = baseUrl + (options.healthPath ?? "/healthy");

  return {
    name,
    webhook: { url: `/test/${name}` },
    trigger: { events: ["push"] },
    environments: {
      test: { healthUrl },
      prod: { healthUrl },
    },
    jobs: {
      deploy: {
        steps: [
          {
            name: "Deploy",
            run: options.command ?? "echo deploy-ok",
          },
        ],
        healthCheck: options.healthCheck ?? true,
        ...(options.rollbackCommand !== undefined
          ? {
              rollback: {
                steps: [
                  {
                    name: "Rollback",
                    run: options.rollbackCommand,
                  },
                ],
              },
            }
          : {}),
      },
    },
  } as Workflow;
}

function createRun(workflow: Workflow): PipelineRun {
  const id = randomUUID();
  createdRunIds.push(id);

  // A minimal queued run for testing executeJob directly.
  return {
    id,
    pipelineId: workflow.name,
    workflow,
    environment: "TEST",
    status: "RUNNING",
    createdAt: new Date(),
    jobs: {
      deploy: {
        jobId: "deploy",
        status: "QUEUED",
      },
    },
  } as unknown as PipelineRun;
}

async function executeScenario(name: string, options: ScenarioOptions = {}) {
  const workflow = createWorkflow(name, options);
  const run = createRun(workflow);

  let thrownError: unknown;

  try {
    await executeJob(workflow, run, "deploy");
  } catch (error) {
    thrownError = error;
  }

  const logs = await readLogEntries(run.id);
  const job = run.jobs.deploy;

  assert.ok(job, "Deploy job must exist");

  assert.ok(
    logs.every((entry) => entry.runId === run.id && entry.jobId === "deploy"),
    "Every log must belong to this job and run",
  );

  return { run, job, logs, thrownError };
}

function messages(logs: ExecutionLogEntry[]) {
  return logs.map((entry) => entry.message);
}

function levels(logs: ExecutionLogEntry[]) {
  return logs.map((entry) => entry.level);
}

function countMatching(logs: ExecutionLogEntry[], pattern: RegExp) {
  return logs.filter((entry) => pattern.test(entry.message)).length;
}

try {
  // ----------------------------------------------------
  // TEST 1 — HEALTHY DEPLOYMENT
  // ----------------------------------------------------
  {
    const { job, logs, thrownError } = await executeScenario("logging-healthy");

    assert.equal(thrownError, undefined);
    assert.equal(job.status, "SUCCESS");
    assert.equal(job.rollbackResult, undefined);

    assert.deepEqual(messages(logs), [
      "Job started",
      "Health check started",
      "Health check passed!",
      "Job completed successfully!",
    ]);

    assert.deepEqual(levels(logs), ["INFO", "INFO", "INFO", "INFO"]);

    console.log("Test 1 passed: Healthy deployment logs ordered correctly");
  }

  // ----------------------------------------------------
  // TEST 2 — FAILED HEALTH CHECK + SUCCESSFUL ROLLBACK
  // ----------------------------------------------------
  {
    const { job, logs, thrownError } = await executeScenario(
      "logging-rollback-success",
      {
        healthPath: "/unhealthy",
        rollbackCommand: "echo rollback-ok",
      },
    );

    assert.ok(thrownError);
    assert.equal(job.status, "FAILED");
    assert.equal(job.rollbackResult?.status, "SUCCESS");

    assert.deepEqual(levels(logs), [
      "INFO",
      "INFO",
      "ERROR",
      "WARN",
      "INFO",
      "ERROR",
    ]);

    assert.equal(logs.length, 6);

    assert.equal(logs[0]?.message, "Job started");
    assert.equal(logs[1]?.message, "Health check started");

    assert.match(logs[2]?.message ?? "", /^Health check failed:/);

    assert.equal(logs[3]?.message, "Rollback started");

    assert.equal(logs[4]?.message, "Rollback completed successfully");

    assert.match(logs[5]?.message ?? "", /^Job failed:/);

    assert.equal(countMatching(logs, /^Job failed:/), 1);

    console.log("Test 2 passed: Successful rollback fully logged");
  }

  // ----------------------------------------------------
  // TEST 3 — FAILED ROLLBACK
  // ----------------------------------------------------
  {
    const { job, logs, thrownError } = await executeScenario(
      "logging-rollback-failed",
      {
        healthPath: "/unhealthy",
        rollbackCommand: "exit 1",
      },
    );

    assert.ok(thrownError);
    assert.equal(job.status, "FAILED");
    assert.equal(job.rollbackResult?.status, "FAILED");

    assert.equal(logs.length, 6);

    assert.deepEqual(levels(logs), [
      "INFO",
      "INFO",
      "ERROR",
      "WARN",
      "ERROR",
      "ERROR",
    ]);

    assert.match(logs[4]?.message ?? "", /^Rollback failed:/);

    assert.match(logs[5]?.message ?? "", /^Job failed:/);

    assert.equal(countMatching(logs, /^Rollback failed:/), 1);

    assert.equal(countMatching(logs, /^Job failed:/), 1);

    assert.match(job.failureReason ?? "", /health check failed/i);

    console.log("Test 3 passed: Failed rollback preserves original failure");
  }

  // ----------------------------------------------------
  // TEST 4 — UNHEALTHY WITHOUT ROLLBACK
  // ----------------------------------------------------
  {
    const { job, logs, thrownError } = await executeScenario(
      "logging-no-rollback",
      {
        healthPath: "/unhealthy",
      },
    );

    assert.ok(thrownError);
    assert.equal(job.status, "FAILED");
    assert.equal(job.rollbackResult, undefined);

    assert.equal(logs.length, 4);

    assert.deepEqual(levels(logs), ["INFO", "INFO", "ERROR", "ERROR"]);

    assert.equal(countMatching(logs, /Rollback/), 0);

    assert.equal(countMatching(logs, /^Job failed:/), 1);

    console.log("Test 4 passed: Missing rollback config handled");
  }

  // ----------------------------------------------------
  // TEST 5 — COMMAND FAILURE SKIPS HEALTH AND ROLLBACK
  // ----------------------------------------------------
  {
    const previousRequests = healthRequests;

    const { job, logs } = await executeScenario("logging-command-failure", {
      command: "exit 1",
      rollbackCommand: "echo should-not-run",
    });

    assert.equal(job.status, "FAILED");
    assert.equal(job.rollbackResult, undefined);

    assert.equal(
      healthRequests,
      previousRequests,
      "Health endpoint must not be called",
    );

    assert.equal(logs.length, 2);

    assert.deepEqual(levels(logs), ["INFO", "ERROR"]);

    assert.equal(countMatching(logs, /Health check/), 0);

    assert.equal(countMatching(logs, /Rollback/), 0);

    console.log("Test 5 passed: Command failure skips health and rollback");
  }

  // ----------------------------------------------------
  // TEST 6 — DIFFERENT RUNS HAVE ISOLATED LOGS
  // ----------------------------------------------------
  {
    const first = await executeScenario("logging-isolation-one");

    const second = await executeScenario("logging-isolation-two", {
      healthPath: "/unhealthy",
    });

    assert.notEqual(first.run.id, second.run.id);

    assert.equal(first.job.status, "SUCCESS");
    assert.equal(second.job.status, "FAILED");

    assert.ok(first.logs.every((entry) => entry.runId === first.run.id));

    assert.ok(second.logs.every((entry) => entry.runId === second.run.id));

    assert.equal(countMatching(first.logs, /^Job failed:/), 0);

    assert.equal(countMatching(second.logs, /^Job failed:/), 1);

    console.log("Test 6 passed: Independent pipeline logs isolated");
  }

  // ----------------------------------------------------
  // TEST 7 — LOGS CONTAIN USEFUL FAILURE METADATA
  // ----------------------------------------------------
  {
    const { job, logs } = await executeScenario("logging-failure-metadata", {
      healthPath: "/unhealthy",
      rollbackCommand: "echo recovery-ok",
    });

    assert.equal(job.status, "FAILED");

    const healthFailure = logs.find((entry) =>
      entry.message.startsWith("Health check failed:"),
    );

    const jobFailure = logs.find((entry) =>
      entry.message.startsWith("Job failed:"),
    );

    assert.ok(healthFailure);
    assert.ok(jobFailure);

    assert.equal(healthFailure.level, "ERROR");
    assert.equal(jobFailure.level, "ERROR");

    assert.ok(job.failureReason);

    assert.ok(
      jobFailure.message.includes(job.failureReason),
      "Final job log should include the original failure",
    );

    console.log("Test 7 passed: Failure reasons and metadata preserved");
  }

  console.log("All Health & Rollback Logging Integration tests passed!");
} finally {
  // Clean up only logs created by this test.
  for (const runId of createdRunIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }

  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
