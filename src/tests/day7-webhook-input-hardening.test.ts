import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-input-hardening-secret";
const SHA = "a".repeat(40);
const REPOSITORY = "example/day7-project";

const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;
const previousToken = process.env.GITHUB_TOKEN;

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

function makePayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ref: "refs/heads/main",
    after: SHA,
    deleted: false,
    repository: {
      full_name: REPOSITORY,
    },
    ...overrides,
  };
}

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

interface SendOptions {
  payload?: unknown;
  rawBody?: string;
  deliveryId: string;
  event?: string;
  invalidSignature?: boolean;
  omitSignature?: boolean;
  omitEvent?: boolean;
  omitDelivery?: boolean;
}

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

let base = "";

async function sendWebhook({
  payload = makePayload(),
  rawBody,
  deliveryId,
  event = "push",
  invalidSignature = false,
  omitSignature = false,
  omitEvent = false,
  omitDelivery = false,
}: SendOptions): Promise<Response> {
  const body = rawBody ?? JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!omitEvent) {
    headers["X-GitHub-Event"] = event;
  }

  if (!omitDelivery) {
    headers["X-GitHub-Delivery"] = deliveryId;
  }

  if (!omitSignature) {
    headers["X-Hub-Signature-256"] = invalidSignature
      ? `sha256=${"0".repeat(64)}`
      : sign(body);
  }

  return fetch(`${base}${workflow.webhook.url}`, {
    method: "POST",
    headers,
    body,
  });
}

async function getMetrics(): Promise<Metrics> {
  const response = await fetch(`${base}${workflow.webhook.url}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
}

async function assertNoRun(): Promise<void> {
  const metrics = await getMetrics();

  assert.equal(metrics.totalRuns, 0);
  assert.equal(metrics.activeRuns, 0);
  assert.equal(metrics.successfulRuns, 0);
  assert.equal(metrics.failedRuns, 0);
}

async function waitForCompletion(): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics();

    if (metrics.totalRuns === 1 && metrics.activeRuns === 0) {
      assert.equal(metrics.successfulRuns, 1);
      assert.equal(metrics.failedRuns, 0);
      return;
    }

    await sleep(25);
  }

  throw new Error("Pipeline did not finish in time");
}

process.env.GITHUB_WEBHOOK_SECRET = SECRET;

// Disable external GitHub reporting in this input-validation
// test. The webhook must still execute valid pipelines.
delete process.env.GITHUB_TOKEN;

let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;

try {
  const { createWebhookRouter } = await import("../routes/webhook.routes.js");

  const app = express();

  app.use(createWebhookRouter([workflow]));

  server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const address = server.address() as AddressInfo;

  base = `http://127.0.0.1:${address.port}`;

  // TEST 1 — Missing GitHub headers
  {
    const response = await sendWebhook({
      deliveryId: "hardening-001",
      omitEvent: true,
      omitDelivery: true,
      omitSignature: true,
    });

    assert.equal(response.status, 400);
    await assertNoRun();

    console.log("Test 1 passed: Missing headers rejected");
  }

  // TEST 2 — Invalid HMAC signature
  {
    const response = await sendWebhook({
      deliveryId: "hardening-002",
      invalidSignature: true,
    });

    assert.ok(response.status >= 400 && response.status < 500);

    await assertNoRun();

    console.log("Test 2 passed: Invalid signature rejected");
  }

  // TEST 3 — Malformed JSON with valid HMAC
  {
    const response = await sendWebhook({
      deliveryId: "hardening-003",
      rawBody: "{invalid-json",
    });

    assert.equal(response.status, 400);
    await assertNoRun();

    console.log("Test 3 passed: Malformed JSON rejected");
  }

  // TEST 4 — Missing repository information
  {
    const response = await sendWebhook({
      deliveryId: "hardening-004",
      payload: makePayload({
        repository: null,
      }),
    });

    assert.equal(response.status, 400);
    await assertNoRun();

    console.log("Test 4 passed: Invalid repository rejected");
  }

  // TEST 5 — Invalid Git branch reference
  {
    const response = await sendWebhook({
      deliveryId: "hardening-005",
      payload: makePayload({
        ref: "refs/tags/v1.0",
      }),
    });

    assert.equal(response.status, 400);
    await assertNoRun();

    console.log("Test 5 passed: Invalid branch ref rejected");
  }

  // TEST 6 — Invalid commit SHA
  {
    const response = await sendWebhook({
      deliveryId: "hardening-006",
      payload: makePayload({
        after: "abc123",
      }),
    });

    assert.equal(response.status, 400);
    await assertNoRun();

    console.log("Test 6 passed: Short commit SHA rejected");
  }

  // TEST 7 — Deleted branch
  {
    const response = await sendWebhook({
      deliveryId: "hardening-007",
      payload: makePayload({
        deleted: true,
        after: "0".repeat(40),
      }),
    });

    assert.equal(response.status, 400);
    await assertNoRun();

    console.log("Test 7 passed: Deleted branch rejected");
  }

  // TEST 8 — Unsubscribed event
  {
    const response = await sendWebhook({
      deliveryId: "hardening-008",
      event: "issues",
    });

    assert.equal(response.status, 200);
    await assertNoRun();

    console.log("Test 8 passed: Unsubscribed event ignored");
  }

  // TEST 9 — A rejected delivery can be retried
  // with valid information.
  {
    const deliveryId = "hardening-retry-001";

    const rejected = await sendWebhook({
      deliveryId,
      invalidSignature: true,
    });

    assert.ok(rejected.status >= 400 && rejected.status < 500);

    await assertNoRun();

    const accepted = await sendWebhook({
      deliveryId,
    });

    assert.equal(accepted.status, 200);

    await waitForCompletion();

    console.log("Test 9 passed: Rejected delivery ID remains reusable");
  }

  console.log("ALL DAY 7 WEBHOOK INPUT HARDENING TESTS PASSED!");
} finally {
  if (server?.listening) {
    server.closeAllConnections();

    await new Promise<void>((resolve, reject) => {
      server!.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  if (previousSecret === undefined) {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  } else {
    process.env.GITHUB_WEBHOOK_SECRET = previousSecret;
  }

  if (previousToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = previousToken;
  }
}
