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

type StartResponse = {
  runId: string;
  status: string;
};

type LogsResponse = {
  runId: string;
  logs: ExecutionLogEntry[];
};

const workflow = {
  name: "logs-filter-test",
  webhook: { url: "/test/logs-filter" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [
        {
          name: "Build",
          run: "echo build-success",
        },
      ],
    },
    audit: {
      steps: [
        {
          name: "Audit",
          run: "exit 1",
        },
      ],
    },
  },
} as Workflow;

const app = express();
app.use(createWebhookRouter([workflow]));

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");

const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const endpoint = "/test/logs-filter";

let createdRunId: string | undefined;

async function requestLogs(runId: string, query = ""): Promise<LogsResponse> {
  const response = await fetch(`${base}${endpoint}/runs/${runId}/logs${query}`);

  assert.equal(response.status, 200);

  return (await response.json()) as LogsResponse;
}

async function waitForPipelineLogs(runId: string): Promise<LogsResponse> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const response = await requestLogs(runId);

    const hasTerminalLog = response.logs.some(
      (entry) =>
        entry.message.startsWith("Pipeline failed") ||
        entry.message === "Pipeline completed successfully",
    );

    if (hasTerminalLog) return response;

    await sleep(50);
  }

  throw new Error("Pipeline logs did not reach a terminal state");
}

try {
  const startResponse = await fetch(`${base}${endpoint}`);

  assert.equal(startResponse.status, 202);

  const started = (await startResponse.json()) as StartResponse;

  createdRunId = started.runId;
  assert.ok(createdRunId);

  const full = await waitForPipelineLogs(createdRunId);

  // TEST 1 — No filters
  {
    assert.equal(full.runId, createdRunId);
    assert.ok(full.logs.length > 0);

    assert.ok(full.logs.some((log) => log.jobId === "build"));

    assert.ok(full.logs.some((log) => log.jobId === "audit"));

    assert.ok(full.logs.some((log) => log.jobId === undefined));

    console.log("Test 1 passed: Unfiltered logs returned");
  }

  // TEST 2 — Filter by ERROR
  {
    const result = await requestLogs(createdRunId, "?level=ERROR");

    assert.ok(result.logs.length > 0);

    assert.ok(result.logs.every((log) => log.level === "ERROR"));

    console.log("Test 2 passed: Logs filtered by level");
  }

  // TEST 3 — Filter by jobId
  {
    const result = await requestLogs(createdRunId, "?jobId=build");

    assert.ok(result.logs.length > 0);

    assert.ok(result.logs.every((log) => log.jobId === "build"));

    console.log("Test 3 passed: Logs filtered by job ID");
  }

  // TEST 4 — Combined filters
  {
    const result = await requestLogs(createdRunId, "?level=INFO&jobId=build");

    assert.ok(result.logs.length > 0);

    assert.ok(
      result.logs.every((log) => log.level === "INFO" && log.jobId === "build"),
    );

    console.log("Test 4 passed: Combined filters applied");
  }

  // TEST 5 — Unknown job ID
  {
    const result = await requestLogs(createdRunId, "?jobId=nonexistent-job");

    assert.deepEqual(result.logs, []);

    console.log("Test 5 passed: Unknown job returns empty logs");
  }

  // TEST 6 — Invalid level rejected
  {
    const response = await fetch(
      `${base}${endpoint}/runs/${createdRunId}/logs?level=INVALID`,
    );

    assert.equal(response.status, 400);

    console.log("Test 6 passed: Invalid log level rejected");
  }

  // TEST 7 — Non-string query rejected
  {
    const response = await fetch(
      `${base}${endpoint}/runs/${createdRunId}/logs?level=INFO&level=ERROR`,
    );

    assert.equal(response.status, 400);

    console.log("Test 7 passed: Repeated log level rejected");
  }

  // TEST 8 — Unknown run still returns 404
  {
    const response = await fetch(
      `${base}${endpoint}/runs/unknown-run/logs?level=INFO`,
    );

    assert.equal(response.status, 404);

    assert.deepEqual(await response.json(), {
      error: "Run not found",
    });

    console.log("Test 8 passed: Unknown run returns 404");
  }

  console.log("All Logs HTTP Filtering tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  if (createdRunId) {
    await rm(join("runtime", "logs", `${createdRunId}.jsonl`), { force: true });
  }
}
