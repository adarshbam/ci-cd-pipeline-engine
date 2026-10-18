import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";

interface MetricsResponse {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  activeRuns: number;
}

interface StartResponse {
  runId: string;
  pipelineId: string;
  status: string;
}

const successWorkflow = {
  name: "metrics-api-success",
  webhook: { url: "/test/metrics-api-success" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [
        {
          name: "Wait",
          run: 'node -e "setTimeout(() => {}, 700)"',
        },
      ],
    },
  },
} as Workflow;

const failureWorkflow = {
  name: "metrics-api-failure",
  webhook: { url: "/test/metrics-api-failure" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Fail", run: "exit 1" }],
    },
  },
} as Workflow;

const app = express();

app.use(createWebhookRouter([successWorkflow, failureWorkflow]));

const server = app.listen(0, "127.0.0.1");
const runIds: string[] = [];

await once(server, "listening");

const address = server.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}`;

async function getMetrics(path: string): Promise<MetricsResponse> {
  const response = await fetch(`${base}${path}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as MetricsResponse;
}

async function startPipeline(path: string): Promise<StartResponse> {
  const response = await fetch(`${base}${path}`);

  assert.equal(response.status, 202);

  const run = (await response.json()) as StartResponse;

  assert.ok(run.runId);
  runIds.push(run.runId);

  return run;
}

async function waitForCompletedRuns(
  path: string,
  expected: number,
): Promise<MetricsResponse> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics(path);

    if (metrics.totalRuns === expected && metrics.activeRuns === 0) {
      return metrics;
    }

    await sleep(50);
  }

  throw new Error(`Metrics did not reach ${expected} completed runs`);
}

const successPath = "/test/metrics-api-success";
const failurePath = "/test/metrics-api-failure";

try {
  // TEST 1 — Initial metrics are empty
  const initial = await getMetrics(successPath);

  assert.deepEqual(initial, {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageDurationMs: 0,
    activeRuns: 0,
  });

  console.log("Test 1 passed: Empty metrics returned");

  // TEST 2 — Running pipelines are tracked
  await startPipeline(successPath);

  const running = await getMetrics(successPath);

  assert.equal(running.activeRuns, 1);
  assert.equal(running.totalRuns, 0);

  console.log("Test 2 passed: Active run exposed");

  // TEST 3 — Successful pipeline updates metrics
  const completed = await waitForCompletedRuns(successPath, 1);

  assert.equal(completed.totalRuns, 1);
  assert.equal(completed.successfulRuns, 1);
  assert.equal(completed.failedRuns, 0);
  assert.equal(completed.activeRuns, 0);

  assert.ok(Number.isFinite(completed.averageDurationMs));

  assert.ok(completed.averageDurationMs >= 0);

  console.log("Test 3 passed: Success metrics exposed");

  // TEST 4 — Failed pipeline updates metrics
  await startPipeline(failurePath);

  const failed = await waitForCompletedRuns(failurePath, 1);

  assert.equal(failed.totalRuns, 1);
  assert.equal(failed.successfulRuns, 0);
  assert.equal(failed.failedRuns, 1);
  assert.equal(failed.activeRuns, 0);

  console.log("Test 4 passed: Failure metrics exposed");

  // TEST 5 — Multiple runs accumulate
  await startPipeline(successPath);

  const updated = await waitForCompletedRuns(successPath, 2);

  assert.equal(updated.totalRuns, 2);
  assert.equal(updated.successfulRuns, 2);
  assert.equal(updated.failedRuns, 0);
  assert.equal(updated.activeRuns, 0);

  console.log("Test 5 passed: Runs accumulate");

  // TEST 6 — Workflow metrics are isolated
  const successMetrics = await getMetrics(successPath);
  const failureMetrics = await getMetrics(failurePath);

  assert.equal(successMetrics.totalRuns, 2);
  assert.equal(successMetrics.failedRuns, 0);

  assert.equal(failureMetrics.totalRuns, 1);
  assert.equal(failureMetrics.failedRuns, 1);

  console.log("Test 6 passed: Workflow isolation");

  // TEST 7 — Unknown metrics route returns 404
  const missing = await fetch(`${base}/unknown-workflow/metrics`);

  assert.equal(missing.status, 404);

  console.log("Test 7 passed: Unknown route returns 404");

  console.log("All Metrics HTTP API tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  for (const runId of runIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
