import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-pending-test-secret";
const TOKEN = "local-github-test-token";
const REPOSITORY = "example/day7-project";
const SHA = "a".repeat(40);
const SECOND_SHA = "b".repeat(40);

const previousEnv = {
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  token: process.env.GITHUB_TOKEN,
  apiBase: process.env.GITHUB_API_BASE_URL,
};

interface StatusRequest {
  path: string;
  authorization: string | undefined;
  state: string;
  context: string | undefined;
  description: string | undefined;
}

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

const reports: StatusRequest[] = [];
let githubResponseCode = 201;
let base = "";
let appServer: Server | undefined;

const githubServer = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;

    reports.push({
      path: req.url ?? "",
      authorization: req.headers.authorization,
      state: String(body.state),
      context: typeof body.context === "string" ? body.context : undefined,
      description:
        typeof body.description === "string" ? body.description : undefined,
    });

    res.writeHead(githubResponseCode, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({ id: 123 }));
  } catch {
    res.writeHead(400);
    res.end();
  }
});

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

function sign(body: string): string {
  return (
    "sha256=" +
    createHmac("sha256", SECRET).update(Buffer.from(body)).digest("hex")
  );
}

async function sendPush(
  deliveryId: string,
  sha = SHA,
  branch = "main",
  repository = REPOSITORY,
): Promise<Response> {
  const body = JSON.stringify({
    ref: `refs/heads/${branch}`,
    after: sha,
    deleted: false,
    repository: {
      full_name: repository,
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

async function getMetrics(): Promise<Metrics> {
  const response = await fetch(`${base}${workflow.webhook.url}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
}

async function waitForRuns(expected: number): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics();

    if (
      metrics.totalRuns === expected &&
      metrics.successfulRuns === expected &&
      metrics.activeRuns === 0
    ) {
      return;
    }

    await sleep(50);
  }

  throw new Error(`Expected ${expected} successful runs`);
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

  // TEST 1 — Valid push sends pending status.
  {
    const response = await sendPush("pending-delivery-001");

    assert.equal(response.status, 200);

    await waitForRuns(1);

    assert.equal(reports.length, 1);

    console.log("Test 1 passed: Pending status reported");
  }

  // TEST 2 — Correct GitHub API request.
  {
    const report = reports[0];

    assert.ok(report);

    assert.equal(report.path, `/repos/${REPOSITORY}/statuses/${SHA}`);

    assert.equal(report.authorization, `Bearer ${TOKEN}`);
    assert.equal(report.state, "pending");
    assert.equal(report.context, "custom-ci/pipeline");
    assert.equal(report.description, "Pipeline running");

    console.log("Test 2 passed: GitHub request correctly formatted");
  }

  // TEST 3 — Duplicate delivery sends nothing.
  {
    const response = await sendPush("pending-delivery-001");

    assert.equal(response.status, 200);

    await sleep(150);

    assert.equal(reports.length, 1);

    const metrics = await getMetrics();
    assert.equal(metrics.totalRuns, 1);

    console.log("Test 3 passed: Duplicate does not report again");
  }

  // TEST 4 — Rejected pushes send nothing.
  {
    const wrongBranch = await sendPush("pending-wrong-branch", SHA, "develop");

    const wrongRepository = await sendPush(
      "pending-wrong-repository",
      SHA,
      "main",
      "attacker/untrusted",
    );

    assert.equal(wrongBranch.status, 200);
    assert.equal(wrongRepository.status, 200);

    assert.equal(reports.length, 1);

    const metrics = await getMetrics();
    assert.equal(metrics.totalRuns, 1);

    console.log("Test 4 passed: Rejected pushes do not report");
  }

  // TEST 5 — GitHub API error allows retry.
  {
    githubResponseCode = 403;

    const failed = await sendPush("pending-retry-001", SECOND_SHA);

    assert.equal(failed.status, 500);

    const beforeRetry = await getMetrics();
    assert.equal(beforeRetry.totalRuns, 1);

    githubResponseCode = 201;

    const retry = await sendPush("pending-retry-001", SECOND_SHA);

    assert.equal(retry.status, 200);

    await waitForRuns(2);

    assert.equal(reports.length, 3);

    assert.deepEqual(
      reports
        .filter((report) => report.path.endsWith(`/statuses/${SECOND_SHA}`))
        .map((report) => report.state),
      ["pending", "pending"],
    );

    console.log("Test 5 passed: Failed reporting allows retry");
  }

  console.log("ALL DAY 7 GITHUB PENDING STATUS TESTS PASSED!");
} finally {
  if (appServer) {
    await closeServer(appServer);
  }

  await closeServer(githubServer);

  function restore(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  restore("GITHUB_WEBHOOK_SECRET", previousEnv.secret);

  restore("GITHUB_TOKEN", previousEnv.token);

  restore("GITHUB_API_BASE_URL", previousEnv.apiBase);
}
