import assert from "node:assert/strict";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";
import type { ExecutionLogEntry } from "../logging/log-entry.js";

type RunResponse = {
  runId: string;
  status: string;
  jobs: Record<string, { status: string }>;
};

type LogsResponse = {
  runId: string;
  logs: ExecutionLogEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

const workflows = [
  {
    name: "final-success",
    webhook: { url: "/test/final-success" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "echo build-ok" }],
      },
      test: {
        needs: ["build"],
        steps: [{ name: "Test", run: "echo test-ok" }],
      },
    },
  },
  {
    name: "final-failure",
    webhook: { url: "/test/final-failure" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "exit 1" }],
      },
      test: {
        needs: ["build"],
        steps: [{ name: "Test", run: "echo should-not-run" }],
      },
    },
  },
] as Workflow[];

const app = express();
app.use(createWebhookRouter(workflows));

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");

const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

const createdRunIds: string[] = [];

async function start(endpoint: string): Promise<string> {
  const response = await fetch(`${base}${endpoint}`);

  assert.equal(response.status, 202);

  const body = (await response.json()) as {
    runId: string;
  };

  assert.ok(body.runId);

  createdRunIds.push(body.runId);

  return body.runId;
}

async function getLogs(
  endpoint: string,
  runId: string,
  query = "",
): Promise<LogsResponse> {
  const response = await fetch(`${base}${endpoint}/runs/${runId}/logs${query}`);

  assert.equal(response.status, 200);

  return (await response.json()) as LogsResponse;
}

async function waitForRun(
  endpoint: string,
  runId: string,
): Promise<RunResponse> {
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${base}${endpoint}/runs/${runId}`);

    assert.equal(response.status, 200);

    const body = (await response.json()) as RunResponse;

    if (body.status === "SUCCESS" || body.status === "FAILED") {
      return body;
    }

    await sleep(50);
  }

  throw new Error(`Run ${runId} timed out`);
}

async function waitForTerminalLogs(
  endpoint: string,
  runId: string,
): Promise<LogsResponse> {
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    const body = await getLogs(endpoint, runId);

    const finished = body.logs.some(
      (entry) =>
        entry.message === "Pipeline completed successfully" ||
        entry.message.startsWith("Pipeline failed"),
    );

    if (finished) return body;

    await sleep(50);
  }

  throw new Error(`Logs for ${runId} timed out`);
}

try {
  const successEndpoint = "/test/final-success";
  const failureEndpoint = "/test/final-failure";

  // TEST 1 — Start two independent pipelines
  const successId = await start(successEndpoint);
  const failureId = await start(failureEndpoint);

  assert.notEqual(successId, failureId);

  console.log("Test 1 passed: Independent pipelines started");

  // TEST 2 — Both pipelines reach correct states
  const successRun = await waitForRun(successEndpoint, successId);

  const failureRun = await waitForRun(failureEndpoint, failureId);

  assert.equal(successRun.status, "SUCCESS");
  assert.equal(failureRun.status, "FAILED");

  console.log("Test 2 passed: Pipeline states are correct");

  // TEST 3 — Dependency execution behaves correctly
  assert.equal(successRun.jobs.build?.status, "SUCCESS");

  assert.equal(successRun.jobs.test?.status, "SUCCESS");

  assert.equal(failureRun.jobs.build?.status, "FAILED");

  assert.equal(failureRun.jobs.test?.status, "SKIPPED");

  console.log("Test 3 passed: Dependency states preserved");

  // Wait for asynchronous pipeline logging.
  const successLogs = await waitForTerminalLogs(successEndpoint, successId);

  const failureLogs = await waitForTerminalLogs(failureEndpoint, failureId);

  // TEST 4 — Pipeline lifecycle logs persisted
  assert.ok(successLogs.logs.some((log) => log.message === "Pipeline started"));

  assert.ok(
    successLogs.logs.some(
      (log) => log.message === "Pipeline completed successfully",
    ),
  );

  assert.ok(failureLogs.logs.some((log) => log.message === "Pipeline started"));

  assert.ok(
    failureLogs.logs.some((log) => log.message.startsWith("Pipeline failed")),
  );

  console.log("Test 4 passed: Pipeline lifecycle logs persisted");

  // TEST 5 — Job logs persisted
  assert.ok(successLogs.logs.some((log) => log.jobId === "build"));

  assert.ok(successLogs.logs.some((log) => log.jobId === "test"));

  assert.ok(
    failureLogs.logs.some(
      (log) => log.jobId === "build" && log.level === "ERROR",
    ),
  );

  console.log("Test 5 passed: Job execution logs persisted");

  // TEST 6 — Filtering and pagination together
  {
    const matching = successLogs.logs.filter(
      (log) => log.level === "INFO" && log.jobId === "build",
    );

    const result = await getLogs(
      successEndpoint,
      successId,
      "?level=INFO&jobId=build&limit=1&offset=0",
    );

    assert.deepEqual(result.logs, matching.slice(0, 1));

    assert.equal(result.pagination.total, matching.length);

    assert.equal(result.pagination.limit, 1);
    assert.equal(result.pagination.offset, 0);

    console.log("Test 6 passed: Filtering and pagination integrated");
  }

  // TEST 7 — Log isolation between workflows
  {
    assert.ok(successLogs.logs.every((log) => log.runId === successId));

    assert.ok(failureLogs.logs.every((log) => log.runId === failureId));

    const crossResponse = await fetch(
      `${base}${successEndpoint}/runs/${failureId}/logs`,
    );

    assert.equal(crossResponse.status, 404);

    console.log("Test 7 passed: Workflow log isolation preserved");
  }

  // TEST 8 — Invalid parameters rejected
  {
    for (const query of [
      "?level=INVALID",
      "?limit=0",
      "?limit=101",
      "?offset=-1",
      "?limit=abc",
    ]) {
      const response = await fetch(
        `${base}${successEndpoint}/runs/${successId}/logs${query}`,
      );

      assert.equal(response.status, 400, `Expected 400 for ${query}`);
    }

    console.log("Test 8 passed: Query validation preserved");
  }

  // TEST 9 — Unknown runs rejected
  {
    const response = await fetch(
      `${base}${successEndpoint}/runs/unknown-run/logs`,
    );

    assert.equal(response.status, 404);

    assert.deepEqual(await response.json(), {
      error: "Run not found",
    });

    console.log("Test 9 passed: Unknown runs rejected");
  }

  // TEST 10 — Repeated reads remain consistent
  {
    const first = await getLogs(successEndpoint, successId);

    const second = await getLogs(successEndpoint, successId);

    assert.deepEqual(first, second);

    console.log("Test 10 passed: Completed logs remain consistent");
  }

  console.log("All Final Logs Integration tests passed!");
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
