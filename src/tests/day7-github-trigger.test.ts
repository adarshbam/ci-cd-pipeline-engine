import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-github-trigger-test-secret";
const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;

process.env.GITHUB_WEBHOOK_SECRET = SECRET;

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

interface MetricsResponse {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  activeRuns: number;
}

interface WebhookResponse {
  received?: boolean;
  event?: string;
  deliveryId?: string;
  error?: string;
}

const app = express();
app.use(createWebhookRouter([workflow]));

const server = app.listen(0, "127.0.0.1");

let base = "";
let deliveryCounter = 0;

function sign(body: string): string {
  return (
    "sha256=" +
    createHmac("sha256", SECRET).update(Buffer.from(body, "utf8")).digest("hex")
  );
}

function createPush(branch = "main", sha = "a".repeat(40)) {
  return {
    ref: `refs/heads/${branch}`,
    after: sha,
    deleted: false,
    repository: {
      full_name: "example/day7-project",
    },
  };
}

async function sendWebhook(
  event: string,
  payload: unknown,
  signature?: string,
): Promise<{ status: number; body: WebhookResponse }> {
  const rawBody = JSON.stringify(payload);
  const deliveryId = `delivery-${++deliveryCounter}`;

  const response = await fetch(`${base}${workflow.webhook.url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-GitHub-Delivery": deliveryId,
      "X-Hub-Signature-256": signature ?? sign(rawBody),
    },
    body: rawBody,
  });

  return {
    status: response.status,
    body: (await response.json()) as WebhookResponse,
  };
}

async function getMetrics(): Promise<MetricsResponse> {
  const response = await fetch(`${base}${workflow.webhook.url}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as MetricsResponse;
}

async function waitForCompletedRuns(
  expected: number,
): Promise<MetricsResponse> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics();

    if (metrics.totalRuns === expected && metrics.activeRuns === 0) {
      return metrics;
    }

    await sleep(50);
  }

  throw new Error(`Expected ${expected} completed pipelines within 20 seconds`);
}

async function assertNoNewRuns(expected: number): Promise<void> {
  await sleep(150);

  const metrics = await getMetrics();

  assert.equal(metrics.totalRuns, expected);
  assert.equal(metrics.activeRuns, 0);
}

try {
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;

  // TEST 1 — Workflow configuration
  {
    assert.deepEqual(workflow.webhook.methods, ["POST"]);

    assert.ok(workflow.trigger.events.includes("push"));

    assert.ok(workflow.trigger.allowedBranches?.includes("main"));

    console.log("Test 1 passed: GitHub triggers configured");
  }

  // TEST 2 — GET cannot start a POST-only workflow
  {
    const response = await fetch(`${base}${workflow.webhook.url}`);

    assert.equal(response.status, 404);

    await assertNoNewRuns(0);

    console.log("Test 2 passed: Unauthenticated GET trigger disabled");
  }

  // TEST 3 — Ping should not start pipelines
  {
    const response = await sendWebhook("ping", { zen: "GitHub webhook ready" });

    assert.equal(response.status, 200);
    assert.equal(response.body.received, true);

    await assertNoNewRuns(0);

    console.log("Test 3 passed: Ping acknowledged without execution");
  }

  // TEST 4 — Unsubscribed events are ignored
  {
    const response = await sendWebhook("issues", { action: "opened" });

    assert.equal(response.status, 200);

    await assertNoNewRuns(0);

    console.log("Test 4 passed: Unsubscribed events ignored");
  }

  // TEST 5 — Branch filtering
  {
    const response = await sendWebhook("push", createPush("develop"));

    assert.equal(response.status, 200);

    await assertNoNewRuns(0);

    console.log("Test 5 passed: Non-matching branch ignored");
  }

  // TEST 6 — Valid signed push starts a pipeline
  {
    const response = await sendWebhook("push", createPush("main"));

    assert.equal(response.status, 200);
    assert.equal(response.body.received, true);
    assert.equal(response.body.event, "push");

    const metrics = await waitForCompletedRuns(1);

    assert.equal(metrics.totalRuns, 1);
    assert.equal(metrics.successfulRuns, 1);
    assert.equal(metrics.failedRuns, 0);

    console.log("Test 6 passed: Signed main push executed successfully");
  }

  // TEST 7 — Invalid signature cannot start a pipeline
  {
    const response = await sendWebhook(
      "push",
      createPush("main"),
      "sha256=" + "0".repeat(64),
    );

    assert.equal(response.status, 401);

    await assertNoNewRuns(1);

    console.log("Test 7 passed: Invalid signature cannot execute pipeline");
  }

  // TEST 8 — Invalid authenticated push cannot execute
  {
    const response = await sendWebhook("push", {
      ref: "refs/heads/main",
      after: "invalid-sha",
      repository: {
        full_name: "example/day7-project",
      },
    });

    assert.equal(response.status, 400);

    await assertNoNewRuns(1);

    console.log("Test 8 passed: Invalid push payload rejected");
  }

  // TEST 9 — A second valid push starts a separate run
  {
    const response = await sendWebhook(
      "push",
      createPush("main", "b".repeat(40)),
    );

    assert.equal(response.status, 200);

    const metrics = await waitForCompletedRuns(2);

    assert.equal(metrics.totalRuns, 2);
    assert.equal(metrics.successfulRuns, 2);
    assert.equal(metrics.failedRuns, 0);

    console.log("Test 9 passed: Separate pushes execute independently");
  }

  console.log("ALL DAY 7 GITHUB TRIGGER INTEGRATION TESTS PASSED!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  if (previousSecret === undefined) {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  } else {
    process.env.GITHUB_WEBHOOK_SECRET = previousSecret;
  }
}
