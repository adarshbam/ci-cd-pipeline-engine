import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-dedup-hardening-secret";
const REPOSITORY = "example/day7-project";
const SHA = "a".repeat(40);

const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;
const previousToken = process.env.GITHUB_TOKEN;

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-dedup-hardening.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

const secondWorkflow: Workflow = {
  ...workflow,
  name: "day7-dedup-hardening-second",
  webhook: {
    ...workflow.webhook,
    url: "/webhooks/day7-dedup-hardening-second",
  },
};

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

interface PushOptions {
  deliveryId: string;
  endpoint?: string;
  branch?: string;
  repository?: string;
  sha?: string;
  invalidSignature?: boolean;
  invalidPayload?: boolean;
}

let base = "";
let server: Server | undefined;

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

async function sendPush({
  deliveryId,
  endpoint = workflow.webhook.url,
  branch = "main",
  repository = REPOSITORY,
  sha = SHA,
  invalidSignature = false,
  invalidPayload = false,
}: PushOptions): Promise<Response> {
  const body = JSON.stringify({
    ref: invalidPayload ? "refs/tags/invalid" : `refs/heads/${branch}`,
    after: sha,
    deleted: false,
    repository: {
      full_name: repository,
    },
  });

  return fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": "push",
      "X-GitHub-Delivery": deliveryId,
      "X-Hub-Signature-256": invalidSignature
        ? `sha256=${"0".repeat(64)}`
        : sign(body),
    },
    body,
  });
}

async function getMetrics(endpoint = workflow.webhook.url): Promise<Metrics> {
  const response = await fetch(`${base}${endpoint}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
}

async function waitForCompletedRuns(
  expectedTotal: number,
  endpoint = workflow.webhook.url,
): Promise<Metrics> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics(endpoint);

    if (metrics.totalRuns === expectedTotal && metrics.activeRuns === 0) {
      return metrics;
    }

    await sleep(25);
  }

  throw new Error(`Timed out waiting for ${expectedTotal} runs`);
}

async function assertSuccessfulRuns(
  count: number,
  endpoint = workflow.webhook.url,
): Promise<void> {
  const metrics = await waitForCompletedRuns(count, endpoint);

  assert.equal(metrics.totalRuns, count);
  assert.equal(metrics.successfulRuns, count);
  assert.equal(metrics.failedRuns, 0);
  assert.equal(metrics.activeRuns, 0);
}

function restoreEnvironment(
  key: string,
  previousValue: string | undefined,
): void {
  if (previousValue === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = previousValue;
  }
}

try {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;

  // GitHub API reporting is already tested elsewhere.
  // This suite focuses only on pipeline deduplication.
  delete process.env.GITHUB_TOKEN;

  const { createWebhookRouter } = await import("../routes/webhook.routes.js");

  const app = express();

  app.use(createWebhookRouter([workflow, secondWorkflow]));

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;

  base = `http://127.0.0.1:${address.port}`;

  // TEST 1 — First delivery runs once.
  {
    const response = await sendPush({
      deliveryId: "dedup-first",
    });

    assert.equal(response.status, 200);

    await assertSuccessfulRuns(1);

    console.log("Test 1 passed: First delivery executed once");
  }

  // TEST 2 — Sequential duplicate is ignored.
  {
    const response = await sendPush({
      deliveryId: "dedup-first",
    });

    assert.equal(response.status, 200);

    await assertSuccessfulRuns(1);

    console.log("Test 2 passed: Sequential duplicate ignored");
  }

  // TEST 3 — Concurrent duplicates start one run.
  {
    const requests = Array.from({ length: 8 }, () =>
      sendPush({
        deliveryId: "dedup-concurrent",
        sha: "b".repeat(40),
      }),
    );

    const responses = await Promise.all(requests);

    for (const response of responses) {
      assert.equal(response.status, 200);
    }

    await assertSuccessfulRuns(2);

    console.log("Test 3 passed: Concurrent duplicates ignored");
  }

  // TEST 4 — Same delivery ID in separate workflows.
  {
    const deliveryId = "dedup-shared-id";

    const firstResponse = await sendPush({
      deliveryId,
      endpoint: workflow.webhook.url,
    });

    const secondResponse = await sendPush({
      deliveryId,
      endpoint: secondWorkflow.webhook.url,
    });

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);

    await assertSuccessfulRuns(3);
    await assertSuccessfulRuns(1, secondWorkflow.webhook.url);

    console.log("Test 4 passed: Workflow delivery IDs isolated");
  }

  // TEST 5 — Rejected branch does not consume ID.
  {
    const deliveryId = "dedup-branch-retry";

    const rejected = await sendPush({
      deliveryId,
      branch: "develop",
    });

    assert.equal(rejected.status, 200);
    await assertSuccessfulRuns(3);

    const accepted = await sendPush({
      deliveryId,
      branch: "main",
    });

    assert.equal(accepted.status, 200);

    await assertSuccessfulRuns(4);

    console.log("Test 5 passed: Rejected branch remains retryable");
  }

  // TEST 6 — Rejected repository does not consume ID.
  {
    const deliveryId = "dedup-repository-retry";

    const rejected = await sendPush({
      deliveryId,
      repository: "attacker/untrusted",
    });

    assert.equal(rejected.status, 200);
    await assertSuccessfulRuns(4);

    const accepted = await sendPush({
      deliveryId,
    });

    assert.equal(accepted.status, 200);

    await assertSuccessfulRuns(5);

    console.log("Test 6 passed: Rejected repository remains retryable");
  }

  // TEST 7 — Invalid signature does not consume ID.
  {
    const deliveryId = "dedup-signature-retry";

    const rejected = await sendPush({
      deliveryId,
      invalidSignature: true,
    });

    assert.ok(rejected.status >= 400 && rejected.status < 500);

    await assertSuccessfulRuns(5);

    const accepted = await sendPush({
      deliveryId,
    });

    assert.equal(accepted.status, 200);

    await assertSuccessfulRuns(6);

    console.log("Test 7 passed: Invalid signature does not consume ID");
  }

  // TEST 8 — Different deliveries of the same commit
  // are treated independently.
  {
    const response = await sendPush({
      deliveryId: "dedup-new-delivery-same-sha",
      sha: SHA,
    });

    assert.equal(response.status, 200);

    await assertSuccessfulRuns(7);

    console.log("Test 8 passed: Different delivery ID executes");
  }

  // TEST 9 — Invalid payload does not consume ID.
  {
    const deliveryId = "dedup-invalid-payload-retry";

    const rejected = await sendPush({
      deliveryId,
      invalidPayload: true,
    });

    assert.equal(rejected.status, 400);
    await assertSuccessfulRuns(7);

    const accepted = await sendPush({
      deliveryId,
    });

    assert.equal(accepted.status, 200);

    await assertSuccessfulRuns(8);

    console.log("Test 9 passed: Invalid payload remains retryable");
  }

  console.log("ALL DAY 7 DEDUPLICATION HARDENING TESTS PASSED!");
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

  restoreEnvironment("GITHUB_WEBHOOK_SECRET", previousSecret);

  restoreEnvironment("GITHUB_TOKEN", previousToken);
}
