import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-full-integration-secret";
const TOKEN = "day7-mock-github-token";

const REPOSITORY = "example/day7-project";
const SUCCESS_SHA = "a".repeat(40);
const FAILURE_SHA = "b".repeat(40);
const SECOND_SHA = "c".repeat(40);

const oldEnv = {
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  token: process.env.GITHUB_TOKEN,
  apiBase: process.env.GITHUB_API_BASE_URL,
};

process.env.GITHUB_WEBHOOK_SECRET = SECRET;
process.env.GITHUB_TOKEN = TOKEN;

interface CapturedStatus {
  path: string;
  authorization: string | undefined;
  state: string;
  context?: string;
  description?: string;
}

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

const reportedStatuses: CapturedStatus[] = [];

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

    reportedStatuses.push({
      path: req.url ?? "",
      authorization: req.headers.authorization,
      state: String(body.state),

      ...(typeof body.context === "string" ? { context: body.context } : {}),

      ...(typeof body.description === "string"
        ? { description: body.description }
        : {}),
    });

    res.writeHead(201, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({ id: reportedStatuses.length }));
  } catch {
    res.writeHead(400);
    res.end();
  }
});

const successWorkflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

const failureWorkflow: Workflow = {
  ...successWorkflow,
  name: "day7-github-failure",
  webhook: {
    ...successWorkflow.webhook,
    url: "/webhooks/day7-github-failure",
  },
  jobs: {
    build: {
      steps: [
        {
          name: "Intentional Failure",
          run: "exit 1",
        },
      ],
    },
  },
};

let appServer: Server | undefined;
let base = "";

function makePush(sha: string, branch = "main", repository = REPOSITORY) {
  return {
    ref: `refs/heads/${branch}`,
    after: sha,
    deleted: false,
    repository: {
      full_name: repository,
    },
  };
}

function sign(body: string): string {
  return (
    "sha256=" +
    createHmac("sha256", SECRET).update(Buffer.from(body, "utf8")).digest("hex")
  );
}

async function send(
  endpoint: string,
  event: string,
  payload: unknown,
  deliveryId: string,
  invalidSignature = false,
): Promise<Response> {
  const rawBody = JSON.stringify(payload);

  return fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-GitHub-Delivery": deliveryId,
      "X-Hub-Signature-256": invalidSignature
        ? "sha256=" + "0".repeat(64)
        : sign(rawBody),
    },
    body: rawBody,
  });
}

function statesFor(sha: string): string[] {
  const suffix = `/statuses/${sha}`;

  return reportedStatuses
    .filter((item) => item.path.endsWith(suffix))
    .map((item) => item.state);
}

async function getMetrics(endpoint: string): Promise<Metrics> {
  const response = await fetch(`${base}${endpoint}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
}

async function waitUntil(
  condition: () => Promise<boolean> | boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (await condition()) return;

    await sleep(50);
  }

  throw new Error(`Timed out waiting for: ${description}`);
}

async function expectNoNewRun(endpoint: string, count: number): Promise<void> {
  await sleep(200);

  const metrics = await getMetrics(endpoint);

  assert.equal(metrics.totalRuns, count);
  assert.equal(metrics.activeRuns, 0);
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

const successPath = successWorkflow.webhook.url;
const failurePath = failureWorkflow.webhook.url;

try {
  // Start mock GitHub API
  githubServer.listen(0, "127.0.0.1");
  await once(githubServer, "listening");

  const githubAddress = githubServer.address() as AddressInfo;

  process.env.GITHUB_API_BASE_URL = `http://127.0.0.1:${githubAddress.port}`;

  // Import after configuring environment
  const { createWebhookRouter } = await import("../routes/webhook.routes.js");

  // Start actual CI/CD HTTP server
  const app = express();

  app.use(createWebhookRouter([successWorkflow, failureWorkflow]));

  appServer = app.listen(0, "127.0.0.1");
  await once(appServer, "listening");

  const appAddress = appServer.address() as AddressInfo;

  base = `http://127.0.0.1:${appAddress.port}`;

  // TEST 1 — Configuration and initial metrics
  {
    assert.deepEqual(successWorkflow.trigger.allowedBranches, ["main"]);

    assert.deepEqual(successWorkflow.trigger.allowedRepositories, [REPOSITORY]);

    const metrics = await getMetrics(successPath);

    assert.equal(metrics.totalRuns, 0);

    console.log("Test 1 passed: Trusted configuration loaded");
  }

  // TEST 2 — Ping doesn't start pipelines
  {
    const response = await send(
      successPath,
      "ping",
      { zen: "GitHub webhook ready" },
      "ping-001",
    );

    assert.equal(response.status, 200);

    await expectNoNewRun(successPath, 0);

    assert.equal(reportedStatuses.length, 0);

    console.log("Test 2 passed: Ping does not execute or report");
  }

  // TEST 3 — Successful pipeline status lifecycle
  {
    const response = await send(
      successPath,
      "push",
      makePush(SUCCESS_SHA),
      "push-success-001",
    );

    assert.equal(response.status, 200);

    await waitUntil(
      () => statesFor(SUCCESS_SHA).includes("success"),
      "Successful GitHub commit status",
    );

    assert.deepEqual(statesFor(SUCCESS_SHA), ["pending", "success"]);

    await waitUntil(async () => {
      const metrics = await getMetrics(successPath);

      return (
        metrics.totalRuns === 1 &&
        metrics.successfulRuns === 1 &&
        metrics.activeRuns === 0
      );
    }, "Successful pipeline metrics");

    console.log("Test 3 passed: Pending to success reported");
  }

  // TEST 4 — Duplicate delivery doesn't rerun
  {
    const before = reportedStatuses.length;

    const response = await send(
      successPath,
      "push",
      makePush(SUCCESS_SHA),
      "push-success-001",
    );

    assert.equal(response.status, 200);

    await expectNoNewRun(successPath, 1);

    assert.equal(reportedStatuses.length, before);

    console.log("Test 4 passed: Duplicate delivery ignored");
  }

  // TEST 5 — Unapproved branch ignored
  {
    const response = await send(
      successPath,
      "push",
      makePush("d".repeat(40), "develop"),
      "push-develop-001",
    );

    assert.equal(response.status, 200);

    await expectNoNewRun(successPath, 1);

    assert.deepEqual(statesFor("d".repeat(40)), []);

    console.log("Test 5 passed: Unapproved branch ignored");
  }

  // TEST 6 — Unapproved repository ignored
  {
    const sha = "e".repeat(40);

    const response = await send(
      successPath,
      "push",
      makePush(sha, "main", "attacker/other"),
      "push-untrusted-repo",
    );

    assert.equal(response.status, 200);

    await expectNoNewRun(successPath, 1);

    assert.deepEqual(statesFor(sha), []);

    console.log("Test 6 passed: Unapproved repository ignored");
  }

  // TEST 7 — Invalid signature cannot report status
  {
    const before = reportedStatuses.length;

    const response = await send(
      successPath,
      "push",
      makePush("f".repeat(40)),
      "push-invalid-signature",
      true,
    );

    assert.equal(response.status, 401);

    await expectNoNewRun(successPath, 1);

    assert.equal(reportedStatuses.length, before);

    console.log("Test 7 passed: Invalid signature cannot execute");
  }

  // TEST 8 — Failed pipeline reports failure
  {
    const response = await send(
      failurePath,
      "push",
      makePush(FAILURE_SHA),
      "push-failure-001",
    );

    assert.equal(response.status, 200);

    await waitUntil(
      () => statesFor(FAILURE_SHA).includes("failure"),
      "Failed GitHub commit status",
    );

    assert.deepEqual(statesFor(FAILURE_SHA), ["pending", "failure"]);

    await waitUntil(async () => {
      const metrics = await getMetrics(failurePath);

      return (
        metrics.totalRuns === 1 &&
        metrics.failedRuns === 1 &&
        metrics.activeRuns === 0
      );
    }, "Failed pipeline metrics");

    console.log("Test 8 passed: Pending to failure reported");
  }

  // TEST 9 — Distinct delivery creates a new run
  {
    const response = await send(
      successPath,
      "push",
      makePush(SECOND_SHA),
      "push-success-002",
    );

    assert.equal(response.status, 200);

    await waitUntil(
      () => statesFor(SECOND_SHA).includes("success"),
      "Second successful commit status",
    );

    assert.deepEqual(statesFor(SECOND_SHA), ["pending", "success"]);

    await waitUntil(async () => {
      const metrics = await getMetrics(successPath);

      return (
        metrics.totalRuns === 2 &&
        metrics.successfulRuns === 2 &&
        metrics.activeRuns === 0
      );
    }, "Second pipeline metrics");

    console.log("Test 9 passed: Independent delivery executed");
  }

  // TEST 10 — All reporting is correctly scoped
  {
    assert.equal(reportedStatuses.length, 6);

    for (const status of reportedStatuses) {
      assert.equal(status.authorization, `Bearer ${TOKEN}`);

      assert.ok(status.path.startsWith(`/repos/${REPOSITORY}/statuses/`));

      assert.equal(status.context, "custom-ci/pipeline");
    }

    console.log("Test 10 passed: GitHub status reporting scoped");
  }

  console.log("ALL DAY 7 FULL GITHUB INTEGRATION TESTS PASSED!");
} finally {
  if (appServer) {
    await closeServer(appServer);
  }

  await closeServer(githubServer);

  function restore(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  restore("GITHUB_WEBHOOK_SECRET", oldEnv.secret);
  restore("GITHUB_TOKEN", oldEnv.token);
  restore("GITHUB_API_BASE_URL", oldEnv.apiBase);
}
