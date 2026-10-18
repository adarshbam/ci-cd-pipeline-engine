import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  activeRuns: number;
}

interface RunResponse {
  runId: string;
  pipelineId: string;
  status: string;
  jobs?: Record<string, { status: string }>;
}

interface LogEntry {
  runId: string;
  jobId?: string;
  level: string;
  message: string;
  timestamp: string;
}

interface LogsResponse {
  runId: string;
  logs: LogEntry[];
}

const successPath = "/test/day6-success";
const failurePath = "/test/day6-failure";
const cyclePath = "/test/day6-cycle";

const successWorkflow = {
  name: "day6-success",
  webhook: { url: successPath },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [
        {
          name: "Build application",
          run: 'node -e "setTimeout(() => {}, 1200)"',
        },
      ],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Run tests", run: "echo tests-passed" }],
    },
  },
} as Workflow;

const failureWorkflow = {
  name: "day6-failure",
  webhook: { url: failurePath },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Fail build", run: "exit 1" }],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Should skip", run: "echo should-not-run" }],
    },
  },
} as Workflow;

const cycleWorkflow = {
  name: "day6-cycle",
  webhook: { url: cyclePath },
  trigger: { events: ["push"] },
  jobs: {
    first: {
      needs: ["second"],
      steps: [{ name: "First", run: "echo first" }],
    },
    second: {
      needs: ["first"],
      steps: [{ name: "Second", run: "echo second" }],
    },
  },
} as Workflow;

const app = express();
app.use(createWebhookRouter([successWorkflow, failureWorkflow, cycleWorkflow]));

const server = app.listen(0, "127.0.0.1");
const createdRunIds: string[] = [];

await once(server, "listening");

const address = server.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}`;

async function getMetrics(path: string): Promise<Metrics> {
  const response = await fetch(`${base}${path}/metrics`);
  assert.equal(response.status, 200);
  return (await response.json()) as Metrics;
}

async function startRun(path: string): Promise<RunResponse> {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 202);

  const run = (await response.json()) as RunResponse;
  assert.ok(run.runId);

  createdRunIds.push(run.runId);
  return run;
}

async function getRun(path: string, runId: string): Promise<RunResponse> {
  const response = await fetch(`${base}${path}/runs/${runId}`);

  assert.equal(response.status, 200);
  return (await response.json()) as RunResponse;
}

async function getLogs(
  path: string,
  runId: string,
  query = "",
): Promise<LogsResponse> {
  const response = await fetch(`${base}${path}/runs/${runId}/logs${query}`);

  assert.equal(response.status, 200);
  return (await response.json()) as LogsResponse;
}

async function waitForCompletion(
  path: string,
  expectedCount: number,
): Promise<Metrics> {
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics(path);

    if (metrics.totalRuns === expectedCount && metrics.activeRuns === 0) {
      return metrics;
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for ${path} to complete`);
}

try {
  // TEST 1 — All workflows begin with empty metrics
  for (const path of [successPath, failurePath, cyclePath]) {
    assert.deepEqual(await getMetrics(path), {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDurationMs: 0,
      activeRuns: 0,
    });
  }

  console.log("Test 1 passed: Initial metrics empty");

  // TEST 2 — Multiple HTTP pipeline starts
  const [first, second] = await Promise.all([
    startRun(successPath),
    startRun(successPath),
  ]);

  assert.notEqual(first.runId, second.runId);

  const runningMetrics = await getMetrics(successPath);

  assert.equal(runningMetrics.activeRuns, 2);
  assert.equal(runningMetrics.totalRuns, 0);

  console.log("Test 2 passed: Concurrent runs tracked");

  // TEST 3 — Successful pipelines update all APIs
  const successMetrics = await waitForCompletion(successPath, 2);

  assert.equal(successMetrics.totalRuns, 2);
  assert.equal(successMetrics.successfulRuns, 2);
  assert.equal(successMetrics.failedRuns, 0);
  assert.equal(successMetrics.activeRuns, 0);
  assert.ok(successMetrics.averageDurationMs >= 0);

  for (const runId of [first.runId, second.runId]) {
    const run = await getRun(successPath, runId);

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs?.build?.status, "SUCCESS");
    assert.equal(run.jobs?.test?.status, "SUCCESS");

    const result = await getLogs(successPath, runId);

    assert.ok(result.logs.length >= 2);
    assert.ok(
      result.logs.some((log) => log.message.includes("Pipeline started")),
    );
  }

  console.log("Test 3 passed: Successful pipelines and APIs");

  // TEST 4 — Failed jobs propagate correct state
  const failedStart = await startRun(failurePath);

  const failedMetrics = await waitForCompletion(failurePath, 1);

  assert.equal(failedMetrics.failedRuns, 1);
  assert.equal(failedMetrics.successfulRuns, 0);

  const failedRun = await getRun(failurePath, failedStart.runId);

  assert.equal(failedRun.status, "FAILED");
  assert.equal(failedRun.jobs?.build?.status, "FAILED");
  assert.equal(failedRun.jobs?.test?.status, "SKIPPED");

  const failedLogs = await getLogs(failurePath, failedStart.runId);

  assert.ok(failedLogs.logs.some((log) => log.level === "ERROR"));

  console.log("Test 4 passed: Failure propagation and logs");

  // TEST 5 — Dependency cycles fail safely
  const cycleStart = await startRun(cyclePath);

  const cycleMetrics = await waitForCompletion(cyclePath, 1);

  assert.equal(cycleMetrics.failedRuns, 1);

  const cycleRun = await getRun(cyclePath, cycleStart.runId);

  assert.equal(cycleRun.status, "FAILED");

  const cycleLogs = await getLogs(cyclePath, cycleStart.runId);

  assert.ok(
    cycleLogs.logs.some(
      (log) => log.level === "ERROR" && log.message.includes("Pipeline failed"),
    ),
  );

  console.log("Test 5 passed: Scheduler errors recorded");

  // TEST 6 — Cross-workflow run access is rejected
  const crossStatus = await fetch(`${base}${failurePath}/runs/${first.runId}`);

  const crossLogs = await fetch(
    `${base}${failurePath}/runs/${first.runId}/logs`,
  );

  assert.equal(crossStatus.status, 404);
  assert.equal(crossLogs.status, 404);

  assert.equal((await getMetrics(successPath)).totalRuns, 2);

  assert.equal((await getMetrics(failurePath)).totalRuns, 1);

  assert.equal((await getMetrics(cyclePath)).totalRuns, 1);

  console.log("Test 6 passed: Workflow data isolated");

  // TEST 7 — Log filtering and pagination work
  const allLogs = await getLogs(successPath, first.runId);

  const jobLogs = await getLogs(successPath, first.runId, "?jobId=build");

  assert.ok(jobLogs.logs.length > 0);
  assert.ok(jobLogs.logs.every((log) => log.jobId === "build"));

  const firstPage = await getLogs(
    successPath,
    first.runId,
    "?limit=1&offset=0",
  );

  const secondPage = await getLogs(
    successPath,
    first.runId,
    "?limit=1&offset=1",
  );

  assert.ok(allLogs.logs.length >= 2);
  assert.equal(firstPage.logs.length, 1);
  assert.equal(secondPage.logs.length, 1);

  assert.deepEqual(firstPage.logs[0], allLogs.logs[0]);

  assert.deepEqual(secondPage.logs[0], allLogs.logs[1]);

  console.log("Test 7 passed: Log filtering and pagination");

  // TEST 8 — Metrics remain stable and invalid requests fail
  const before = await getMetrics(successPath);

  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await getMetrics(successPath), before);
  }

  const invalidLevel = await fetch(
    `${base}${successPath}/runs/${first.runId}/logs?level=TRACE`,
  );

  const unknownRun = await fetch(`${base}${successPath}/runs/unknown-run-id`);

  assert.equal(invalidLevel.status, 400);
  assert.equal(unknownRun.status, 404);

  console.log("Test 8 passed: Stable metrics and validation");

  console.log("ALL DAY 6 FINAL INTEGRATION TESTS PASSED!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  for (const runId of createdRunIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
