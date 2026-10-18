import assert from "node:assert/strict";
import { once } from "node:events";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
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
  name: "logs-robustness",
  webhook: { url: "/test/logs-robustness" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Build", run: "echo build-ok" }],
    },
  },
} as Workflow;

const app = express();
app.use(createWebhookRouter([workflow]));

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");

const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}/test/logs-robustness`;

const createdRunIds: string[] = [];
const backups = new Map<string, string>();

function getLogPath(runId: string): string {
  return join("runtime", "logs", `${runId}.jsonl`);
}

async function startPipeline(): Promise<string> {
  const response = await fetch(base);

  assert.equal(response.status, 202);

  const result = (await response.json()) as {
    runId: string;
  };

  assert.ok(result.runId);
  createdRunIds.push(result.runId);

  return result.runId;
}

async function getLogs(runId: string, query = ""): Promise<Response> {
  return fetch(`${base}/runs/${runId}/logs${query}`);
}

async function waitForTerminalLogs(runId: string): Promise<LogsResponse> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const response = await getLogs(runId);
    assert.equal(response.status, 200);

    const body = (await response.json()) as LogsResponse;

    const finished = body.logs.some(
      (log) =>
        log.message === "Pipeline completed successfully" ||
        log.message.startsWith("Pipeline failed"),
    );

    if (finished) return body;

    await sleep(50);
  }

  throw new Error("Pipeline logging timed out");
}

try {
  // Prepare two independent completed pipeline runs.
  const firstRunId = await startPipeline();
  const firstLogs = await waitForTerminalLogs(firstRunId);

  const secondRunId = await startPipeline();
  const secondLogs = await waitForTerminalLogs(secondRunId);

  // TEST 1 — Normal logs endpoint remains healthy
  {
    assert.notEqual(firstRunId, secondRunId);
    assert.ok(firstLogs.logs.length > 0);
    assert.ok(secondLogs.logs.length > 0);

    const response = await getLogs(firstRunId);

    assert.equal(response.status, 200);

    const result = (await response.json()) as LogsResponse;

    assert.equal(result.runId, firstRunId);
    assert.ok(result.pagination);

    console.log("Test 1 passed: Normal logs endpoint works");
  }

  // TEST 2 — Malformed query parameters rejected
  {
    const invalidQueries = [
      "?level=DEBUG",
      "?level=INFO&level=ERROR",
      "?jobId=build&jobId=other",
      "?jobId=../secrets",
      "?limit=-1",
      "?limit=101",
      "?limit=1.5",
      "?limit=1&limit=2",
      "?offset=-1",
      "?offset=abc",
      "?offset=1&offset=2",
    ];

    for (const query of invalidQueries) {
      const response = await getLogs(firstRunId, query);

      assert.equal(
        response.status,
        400,
        `Expected 400 for ${query}, got ${response.status}`,
      );
    }

    console.log("Test 2 passed: Malformed queries rejected");
  }

  // TEST 3 — Unknown pipeline run returns 404
  {
    const response = await getLogs("nonexistent-run");

    assert.equal(response.status, 404);

    assert.deepEqual(await response.json(), {
      error: "Run not found",
    });

    console.log("Test 3 passed: Unknown run returns 404");
  }

  // Corrupt the FIRST pipeline log file.
  const firstPath = getLogPath(firstRunId);

  const originalContent = await readFile(firstPath, "utf8");

  backups.set(firstPath, originalContent);

  await appendFile(firstPath, "\n{ this is invalid JSON }\n");

  // TEST 4 — Corrupted JSONL returns safe HTTP 500
  {
    const response = await getLogs(firstRunId);

    assert.equal(response.status, 500);

    const body = await response.json();

    assert.deepEqual(body, {
      error: "Failed to read logs",
    });

    console.log("Test 4 passed: Corrupted logs return safe 500");
  }

  // TEST 5 — Other pipeline remains unaffected
  {
    const response = await getLogs(secondRunId);

    assert.equal(response.status, 200);

    const body = (await response.json()) as LogsResponse;

    assert.equal(body.runId, secondRunId);

    assert.ok(body.logs.every((log) => log.runId === secondRunId));

    console.log("Test 5 passed: Other pipeline remains healthy");
  }

  // Repair the corrupted log file.
  await writeFile(firstPath, originalContent);
  backups.delete(firstPath);

  // TEST 6 — API recovers after log repair
  {
    const response = await getLogs(firstRunId);

    assert.equal(response.status, 200);

    const body = (await response.json()) as LogsResponse;

    assert.deepEqual(body.logs, firstLogs.logs);

    console.log("Test 6 passed: Log API recovers after repair");
  }

  // TEST 7 — Pipeline logs remain isolated
  {
    const responseA = await getLogs(firstRunId);
    const responseB = await getLogs(secondRunId);

    const a = (await responseA.json()) as LogsResponse;

    const b = (await responseB.json()) as LogsResponse;

    assert.ok(a.logs.every((log) => log.runId === firstRunId));

    assert.ok(b.logs.every((log) => log.runId === secondRunId));

    console.log("Test 7 passed: Pipeline logs stay isolated");
  }

  console.log("All Logs HTTP Robustness tests passed!");
} finally {
  // Restore any files still modified if an assertion fails.
  for (const [path, original] of backups) {
    await writeFile(path, original);
  }

  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  // Delete only files belonging to this test.
  for (const runId of createdRunIds) {
    await rm(getLogPath(runId), { force: true });
  }
}

