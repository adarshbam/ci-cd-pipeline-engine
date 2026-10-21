import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-health-rollback.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

const runIds: string[] = [];
const requests = {
  test: 0,
  prod: 0,
};

// Local HTTP server simulating deployed applications.
const server = createServer((req, res) => {
  if (req.url === "/test/health") {
    requests.test++;
    res.writeHead(200);
    res.end("healthy");
    return;
  }

  if (req.url === "/prod/health") {
    requests.prod++;
    res.writeHead(503);
    res.end("unhealthy");
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

async function waitForCompletion(
  engine: PipelineEngine,
  expectedRuns: number,
): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const metrics = engine.getMetricsSnapshot();

    if (
      metrics.totalRuns === expectedRuns &&
      engine.getActiveRunCount() === 0
    ) {
      return;
    }

    await sleep(30);
  }

  throw new Error("Pipeline did not finish in time");
}

async function startAndWait(
  engine: PipelineEngine,
  branch: string,
  expectedCompleted: number,
) {
  const run = await engine.run(branch);
  runIds.push(run.id);

  await waitForCompletion(engine, expectedCompleted);

  return run;
}

try {
  // Start the local health-check server.
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  workflow.environments = {
    test: {
      healthUrl: `${base}/test/health`,
    },
    prod: {
      healthUrl: `${base}/prod/health`,
    },
  };

  // TEST 1 — Configuration
  assert.equal(workflow.jobs.deploy?.healthCheck, true);

  assert.ok(workflow.jobs.deploy?.rollback);

  assert.equal(workflow.jobs.deploy.rollback?.steps.length, 1);

  assert.deepEqual(workflow.jobs.afterDeploy?.needs, ["deploy"]);

  console.log("Test 1 passed: Health check and rollback configured");

  const engine = new PipelineEngine(workflow);

  // TEST 2 — Healthy TEST deployment
  const healthyRun = await startAndWait(engine, "develop", 1);

  assert.equal(healthyRun.environment, "TEST");
  assert.equal(healthyRun.status, "SUCCESS");

  assert.equal(healthyRun.jobs.deploy?.status, "SUCCESS");

  assert.equal(healthyRun.jobs.afterDeploy?.status, "SUCCESS");

  assert.equal(healthyRun.jobs.deploy?.rollbackResult, undefined);

  assert.ok(requests.test >= 1, "TEST health endpoint was never checked");

  console.log("Test 2 passed: Healthy deployment succeeds");

  // TEST 3 — Unhealthy PROD deployment
  const unhealthyRun = await startAndWait(engine, "main", 2);

  assert.equal(unhealthyRun.environment, "PROD");
  assert.equal(unhealthyRun.status, "FAILED");

  assert.equal(unhealthyRun.jobs.deploy?.status, "FAILED");

  assert.ok(requests.prod >= 1, "PROD health endpoint was never checked");

  console.log("Test 3 passed: Unhealthy deployment fails");

  // TEST 4 — Automatic rollback and failure metadata
  const deployJob = unhealthyRun.jobs.deploy;

  assert.ok(deployJob);

  assert.equal(
    deployJob.rollbackResult?.status,
    "SUCCESS",
    "Automatic rollback did not succeed",
  );

  assert.ok(
    deployJob.failureReason?.includes("Deployment health check failed"),
    "Original deployment failure was not preserved",
  );

  assert.equal(
    unhealthyRun.jobs.afterDeploy?.status,
    "SKIPPED",
    "Dependent job ran after deployment failure",
  );

  console.log("Test 4 passed: Rollback and failure propagation");

  // TEST 5 — Both runs tracked independently
  const metrics = engine.getMetricsSnapshot();

  assert.equal(metrics.totalRuns, 2);
  assert.equal(metrics.successfulRuns, 1);
  assert.equal(metrics.failedRuns, 1);

  assert.equal(engine.getActiveRunCount(), 0);

  assert.notEqual(healthyRun.id, unhealthyRun.id);

  assert.equal(healthyRun.jobs.deploy?.rollbackResult, undefined);

  assert.equal(unhealthyRun.jobs.deploy?.rollbackResult?.status, "SUCCESS");

  console.log("Test 5 passed: Successful and failed runs isolated");

  // TEST 6 — Command failures must not trigger rollback.
  const commandFailureWorkflow = structuredClone(workflow);

  commandFailureWorkflow.name = "day7-command-failure";

  commandFailureWorkflow.webhook.url = "/webhooks/day7-command-failure";

  const commandFailureDeploy = commandFailureWorkflow.jobs.deploy;

  assert.ok(commandFailureDeploy);

  commandFailureDeploy.steps = [
    {
      name: "Simulate deployment command failure",
      run: "exit 1",
    },
  ];

  const prodRequestsBefore = requests.prod;

  const commandFailureEngine = new PipelineEngine(commandFailureWorkflow);

  const commandFailureRun = await startAndWait(commandFailureEngine, "main", 1);

  assert.equal(commandFailureRun.status, "FAILED");

  assert.equal(commandFailureRun.jobs.deploy?.status, "FAILED");

  assert.equal(commandFailureRun.jobs.deploy?.rollbackResult, undefined);

  assert.equal(
    requests.prod,
    prodRequestsBefore,
    "Health endpoint was called after command failure",
  );

  assert.equal(commandFailureRun.jobs.afterDeploy?.status, "SKIPPED");

  console.log("Test 6 passed: Command failure skips health and rollback");

  console.log("ALL DAY 7 HEALTH & ROLLBACK TESTS PASSED!");
} finally {
  if (server.listening) {
    server.closeAllConnections();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  for (const runId of runIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
