import assert from "node:assert/strict";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import express from "express";

import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";
import type { ExecutionLogEntry } from "../logging/log-entry.js";

const workflow = {
  name: "logs-http-test",
  webhook: { url: "/test/logs-http" },
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
  },
} as Workflow;

type StartResponse = {
  runId: string;
  pipelineId: string;
  status: string;
};

type LogsResponse = {
  runId: string;
  logs: ExecutionLogEntry[];
};

const app = express();
app.use(createWebhookRouter([workflow]));

const server = app.listen(0, "127.0.0.1");

await once(server, "listening");

const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;
const endpoint = "/test/logs-http";

const createdRunIds: string[] = [];

try {
  // TEST 1 — Start pipeline
  const startResponse = await fetch(`${baseUrl}${endpoint}`);

  assert.equal(startResponse.status, 202);

  const started = (await startResponse.json()) as StartResponse;

  assert.ok(started.runId);
  createdRunIds.push(started.runId);

  console.log("Test 1 passed: Pipeline started");

  // TEST 2 — Valid run returns logs
  const response = await fetch(
    `${baseUrl}${endpoint}/runs/${started.runId}/logs`,
  );

  assert.equal(response.status, 200);

  const result = (await response.json()) as LogsResponse;

  assert.equal(result.runId, started.runId);
  assert.ok(Array.isArray(result.logs));

  console.log("Test 2 passed: Logs endpoint returns HTTP 200");

  // TEST 3 — Pipeline start log is available
  assert.ok(
    result.logs.some(
      (entry) =>
        entry.message === "Pipeline started" &&
        entry.runId === started.runId &&
        entry.level === "INFO",
    ),
    "Pipeline start log must be present",
  );

  console.log("Test 3 passed: Pipeline start event retrieved");

  // TEST 4 — Unknown run returns 404
  const missingResponse = await fetch(
    `${baseUrl}${endpoint}/runs/unknown-run-id/logs`,
  );

  assert.equal(missingResponse.status, 404);

  assert.deepEqual(await missingResponse.json(), {
    error: "Run not found",
  });

  console.log("Test 4 passed: Unknown run returns 404");

  // TEST 5 — Valid log entries have required fields
  for (const entry of result.logs) {
    assert.equal(typeof entry.timestamp, "string");
    assert.equal(entry.runId, started.runId);
    assert.equal(typeof entry.level, "string");
    assert.equal(typeof entry.message, "string");
  }

  console.log("Test 5 passed: Structured log fields preserved");

  console.log("All Logs HTTP API tests passed!");
} finally {
  // Finish any active requests and close the server.
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  // Remove only the test pipeline's log files.
  for (const runId of createdRunIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
