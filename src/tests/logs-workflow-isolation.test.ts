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
    name: "workflow-alpha",
    webhook: { url: "/test/alpha" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "echo alpha" }],
      },
    },
  },
  {
    name: "workflow-beta",
    webhook: { url: "/test/beta" },
    trigger: { events: ["push"] },
    jobs: {
      deploy: {
        steps: [{ name: "Deploy", run: "echo beta" }],
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

async function startRun(endpoint: string): Promise<string> {
  const response = await fetch(`${base}${endpoint}`);

  assert.equal(response.status, 202);

  const body = (await response.json()) as {
    runId: string;
  };

  assert.ok(body.runId);
  createdRunIds.push(body.runId);

  return body.runId;
}

async function requestLogs(
  endpoint: string,
  runId: string,
  query = "",
): Promise<Response> {
  return fetch(`${base}${endpoint}/runs/${runId}/logs${query}`);
}

async function waitForCompletion(
  endpoint: string,
  runId: string,
): Promise<LogsResponse> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const response = await requestLogs(endpoint, runId);
    assert.equal(response.status, 200);

    const body = (await response.json()) as LogsResponse;

    if (
      body.logs.some(
        (entry) =>
          entry.message === "Pipeline completed successfully" ||
          entry.message.startsWith("Pipeline failed"),
      )
    ) {
      return body;
    }

    await sleep(50);
  }

  throw new Error("Pipeline did not finish in time");
}

try {
  const alphaId = await startRun("/test/alpha");
  const betaId = await startRun("/test/beta");

  const alphaLogs = await waitForCompletion("/test/alpha", alphaId);

  const betaLogs = await waitForCompletion("/test/beta", betaId);

  // TEST 1 — Both workflows are accessible
  {
    assert.notEqual(alphaId, betaId);
    assert.ok(alphaLogs.logs.length > 0);
    assert.ok(betaLogs.logs.length > 0);

    console.log("Test 1 passed: Both workflows return logs");
  }

  // TEST 2 — Alpha logs contain only Alpha run
  {
    assert.ok(alphaLogs.logs.every((entry) => entry.runId === alphaId));

    assert.ok(alphaLogs.logs.some((entry) => entry.jobId === "build"));

    console.log("Test 2 passed: Alpha logs isolated");
  }

  // TEST 3 — Beta logs contain only Beta run
  {
    assert.ok(betaLogs.logs.every((entry) => entry.runId === betaId));

    assert.ok(betaLogs.logs.some((entry) => entry.jobId === "deploy"));

    console.log("Test 3 passed: Beta logs isolated");
  }

  // TEST 4 — Cross-workflow access denied
  {
    const wrongAlpha = await requestLogs("/test/alpha", betaId);

    const wrongBeta = await requestLogs("/test/beta", alphaId);

    assert.equal(wrongAlpha.status, 404);
    assert.equal(wrongBeta.status, 404);

    assert.deepEqual(await wrongAlpha.json(), {
      error: "Run not found",
    });

    assert.deepEqual(await wrongBeta.json(), {
      error: "Run not found",
    });

    console.log("Test 4 passed: Cross-workflow access rejected");
  }

  // TEST 5 — Filters and pagination stay isolated
  {
    const response = await requestLogs(
      "/test/alpha",
      alphaId,
      "?jobId=build&level=INFO&limit=1&offset=0",
    );

    assert.equal(response.status, 200);

    const body = (await response.json()) as LogsResponse;

    assert.equal(body.runId, alphaId);
    assert.ok(body.logs.length <= 1);

    assert.ok(
      body.logs.every(
        (entry) => entry.jobId === "build" && entry.level === "INFO",
      ),
    );

    assert.equal(body.pagination.limit, 1);
    assert.equal(body.pagination.offset, 0);

    console.log("Test 5 passed: Filters remain workflow-scoped");
  }

  // TEST 6 — Invalid Alpha query doesn't affect Beta
  {
    const invalid = await requestLogs("/test/alpha", alphaId, "?limit=-5");

    assert.equal(invalid.status, 400);

    const valid = await requestLogs("/test/beta", betaId);

    assert.equal(valid.status, 200);

    const body = (await valid.json()) as LogsResponse;

    assert.equal(body.runId, betaId);
    assert.ok(body.logs.length > 0);

    console.log("Test 6 passed: Invalid requests remain isolated");
  }

  console.log("All Cross-Workflow Log Isolation tests passed!");
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
