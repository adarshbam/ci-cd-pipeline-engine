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

const workflow = {
  name: "pagination-test",
  webhook: { url: "/test/pagination" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Build", run: "echo build-ok" }],
    },
    audit: {
      steps: [{ name: "Audit", run: "exit 1" }],
    },
    package: {
      needs: ["build"],
      steps: [{ name: "Package", run: "echo package-ok" }],
    },
  },
} as Workflow;

const app = express();
app.use(createWebhookRouter([workflow]));

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");

const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}/test/pagination`;

let runId: string | undefined;

async function getLogs(query = ""): Promise<LogsResponse> {
  assert.ok(runId);

  const response = await fetch(`${base}/runs/${runId}/logs${query}`);

  assert.equal(response.status, 200);

  return (await response.json()) as LogsResponse;
}

async function expectBadRequest(query: string) {
  assert.ok(runId);

  const response = await fetch(`${base}/runs/${runId}/logs${query}`);

  assert.equal(response.status, 400);
}

try {
  const startedResponse = await fetch(base);
  assert.equal(startedResponse.status, 202);

  const started = (await startedResponse.json()) as {
    runId: string;
  };

  runId = started.runId;
  assert.ok(runId);

  // Wait until the pipeline finishes logging.
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const response = await getLogs();

    const finished = response.logs.some(
      (log) =>
        log.message.startsWith("Pipeline failed") ||
        log.message === "Pipeline completed successfully",
    );

    if (finished) break;

    await sleep(50);
  }

  const all = await getLogs();
  assert.ok(
    all.logs.some((log) => log.message.startsWith("Pipeline failed")),
    "Pipeline must finish before pagination assertions",
  );

  const allLogs = all.logs;
  assert.ok(allLogs.length >= 6);

  // TEST 1 — Default pagination
  {
    assert.equal(all.pagination.limit, 50);
    assert.equal(all.pagination.offset, 0);
    assert.equal(all.pagination.total, allLogs.length);
    assert.equal(all.pagination.hasMore, false);

    console.log("Test 1 passed: Default pagination");
  }

  // TEST 2 — First page
  {
    const result = await getLogs("?limit=2&offset=0");

    assert.equal(result.logs.length, 2);
    assert.deepEqual(result.logs, allLogs.slice(0, 2));
    assert.equal(result.pagination.total, allLogs.length);
    assert.equal(result.pagination.limit, 2);
    assert.equal(result.pagination.offset, 0);
    assert.equal(result.pagination.hasMore, true);

    console.log("Test 2 passed: First page retrieved");
  }

  // TEST 3 — Next page
  {
    const result = await getLogs("?limit=2&offset=2");

    assert.deepEqual(result.logs, allLogs.slice(2, 4));
    assert.equal(result.pagination.offset, 2);

    console.log("Test 3 passed: Next page retrieved");
  }

  // TEST 4 — Last page
  {
    const offset = allLogs.length - 1;

    const result = await getLogs(`?limit=2&offset=${offset}`);

    assert.equal(result.logs.length, 1);
    assert.equal(result.pagination.hasMore, false);

    console.log("Test 4 passed: Last page detected");
  }

  // TEST 5 — Offset beyond total
  {
    const result = await getLogs("?limit=10&offset=9999");

    assert.deepEqual(result.logs, []);
    assert.equal(result.pagination.hasMore, false);
    assert.equal(result.pagination.total, allLogs.length);

    console.log("Test 5 passed: Large offset handled");
  }

  // TEST 6 — Filtering happens before pagination
  {
    const matching = allLogs.filter((log) => log.level === "INFO");

    const result = await getLogs("?level=INFO&limit=2&offset=1");

    assert.deepEqual(result.logs, matching.slice(1, 3));

    assert.equal(result.pagination.total, matching.length);

    console.log("Test 6 passed: Filtering before pagination");
  }

  // TEST 7 — Job filter with pagination
  {
    const matching = allLogs.filter((log) => log.jobId === "build");

    const result = await getLogs("?jobId=build&limit=1&offset=0");

    assert.deepEqual(result.logs, matching.slice(0, 1));
    assert.equal(result.pagination.total, matching.length);

    console.log("Test 7 passed: Job pagination supported");
  }

  // TEST 8 — Invalid limits rejected
  {
    for (const query of [
      "?limit=0",
      "?limit=-1",
      "?limit=101",
      "?limit=abc",
      "?limit=1.5",
      "?limit=1&limit=2",
      "?limit=9007199254740992",
    ]) {
      await expectBadRequest(query);
    }

    console.log("Test 8 passed: Invalid limits rejected");
  }

  // TEST 9 — Invalid offsets rejected
  {
    for (const query of [
      "?offset=-1",
      "?offset=abc",
      "?offset=1.5",
      "?offset=1&offset=2",
      "?offset=9007199254740992",
    ]) {
      await expectBadRequest(query);
    }

    console.log("Test 9 passed: Invalid offsets rejected");
  }

  // TEST 10 — Combined filters and pagination
  {
    const matching = allLogs.filter(
      (log) => log.level === "INFO" && log.jobId === "build",
    );

    const result = await getLogs("?level=INFO&jobId=build&limit=1&offset=0");

    assert.deepEqual(result.logs, matching.slice(0, 1));
    assert.equal(result.pagination.total, matching.length);

    console.log("Test 10 passed: Combined filters and pagination");
  }

  console.log("All Log Pagination tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  if (runId) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
