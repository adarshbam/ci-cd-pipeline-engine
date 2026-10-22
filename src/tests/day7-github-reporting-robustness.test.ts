import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-reporting-robustness-secret";
const TOKEN = "local-test-token";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

const previous = {
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  token: process.env.GITHUB_TOKEN,
  apiBase: process.env.GITHUB_API_BASE_URL,
};

interface Report {
  sha: string;
  state: string;
}

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

const reports: Report[] = [];
let rejectNextFinalReport = false;
let failedFinalReports = 0;
let base = "";
let appServer: Server | undefined;

const githubServer = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      state: string;
    };

    const sha = req.url?.split("/statuses/")[1] ?? "";

    reports.push({ sha, state: body.state });

    if (body.state === "success" && rejectNextFinalReport) {
      rejectNextFinalReport = false;
      failedFinalReports++;

      res.writeHead(503);
      res.end("Simulated GitHub failure");
      return;
    }

    res.writeHead(201, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({ id: reports.length }));
  } catch {
    res.writeHead(400);
    res.end();
  }
});

const originalWorkflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

// Deliberately slow so HTTP acknowledgement can be
// verified before pipeline execution completes.
const workflow: Workflow = {
  ...originalWorkflow,
  jobs: {
    build: {
      steps: [
        {
          name: "Slow build",
          run: "sleep 1; echo build-finished",
        },
      ],
    },
    test: {
      needs: ["build"],
      steps: [
        {
          name: "Test build",
          run: "echo tests-passed",
        },
      ],
    },
  },
};

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

async function sendPush(deliveryId: string, sha: string): Promise<Response> {
  const body = JSON.stringify({
    ref: "refs/heads/main",
    after: sha,
    repository: {
      full_name: "example/day7-project",
    },
  });

  return fetch(`${base}${workflow.webhook.url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": "push",
      "X-GitHub-Delivery": deliveryId,
      "X-Hub-Signature-256": sign(body),
    },
    body,
  });
}

function statesFor(sha: string): string[] {
  return reports
    .filter((report) => report.sha === sha)
    .map((report) => report.state);
}

async function waitForReportCount(sha: string, count: number): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (statesFor(sha).length >= count) return;
    await sleep(25);
  }

  throw new Error(`Timed out waiting for ${count} reports`);
}

async function getMetrics(): Promise<Metrics> {
  const response = await fetch(`${base}${workflow.webhook.url}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
}

async function waitForCompletedRuns(count: number): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics();

    if (metrics.totalRuns === count && metrics.activeRuns === 0) {
      return;
    }

    await sleep(25);
  }

  throw new Error("Timed out waiting for completed runs");
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;

  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

try {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  process.env.GITHUB_TOKEN = TOKEN;

  githubServer.listen(0, "127.0.0.1");
  await once(githubServer, "listening");

  const githubAddress = githubServer.address() as AddressInfo;

  process.env.GITHUB_API_BASE_URL = `http://127.0.0.1:${githubAddress.port}`;

  const { createWebhookRouter } = await import("../routes/webhook.routes.js");

  const app = express();
  app.use(createWebhookRouter([workflow]));

  appServer = app.listen(0, "127.0.0.1");
  await once(appServer, "listening");

  const appAddress = appServer.address() as AddressInfo;
  base = `http://127.0.0.1:${appAddress.port}`;

  // TEST 1 — Webhook acknowledges before completion.
  {
    const response = await sendPush("robustness-delivery-001", SHA_A);

    assert.equal(response.status, 200);

    const metrics = await getMetrics();

    assert.equal(metrics.activeRuns, 1);
    assert.deepEqual(statesFor(SHA_A), ["pending"]);

    console.log("Test 1 passed: Webhook responds while pipeline runs");
  }

  // TEST 2 — Final success eventually reported.
  {
    await waitForReportCount(SHA_A, 2);

    assert.deepEqual(statesFor(SHA_A), ["pending", "success"]);

    await waitForCompletedRuns(1);

    console.log("Test 2 passed: Final status reported asynchronously");
  }

  // TEST 3 — GitHub rejects final status.
  {
    rejectNextFinalReport = true;

    const response = await sendPush("robustness-delivery-002", SHA_B);

    assert.equal(response.status, 200);

    await waitForReportCount(SHA_B, 2);
    await waitForCompletedRuns(2);

    assert.deepEqual(statesFor(SHA_B), ["pending", "success"]);

    assert.equal(failedFinalReports, 1);

    console.log("Test 3 passed: Final GitHub API failure handled");
  }

  // TEST 4 — Duplicate must not restart pipeline.
  {
    const response = await sendPush("robustness-delivery-002", SHA_B);

    assert.equal(response.status, 200);

    const metrics = await getMetrics();

    assert.equal(metrics.totalRuns, 2);
    assert.equal(metrics.successfulRuns, 2);

    assert.deepEqual(statesFor(SHA_B), ["pending", "success"]);

    console.log("Test 4 passed: Failed final reporting does not restart run");
  }

  console.log("ALL DAY 7 GITHUB REPORTING ROBUSTNESS TESTS PASSED!");
} finally {
  if (appServer) await closeServer(appServer);

  await closeServer(githubServer);

  restore("GITHUB_WEBHOOK_SECRET", previous.secret);

  restore("GITHUB_TOKEN", previous.token);

  restore("GITHUB_API_BASE_URL", previous.apiBase);
}
