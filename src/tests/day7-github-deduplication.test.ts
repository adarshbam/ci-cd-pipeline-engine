import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-deduplication-test-secret";
const REPOSITORY = "example/day7-project";
const SHA = "a".repeat(40);

const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;

process.env.GITHUB_WEBHOOK_SECRET = SECRET;

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

const originalWorkflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

function makeWorkflow(
  name: string,
  path: string,
  allowedBranches: string[] = ["main"],
): Workflow {
  return {
    ...originalWorkflow,
    name,
    webhook: {
      ...originalWorkflow.webhook,
      url: path,
    },
    trigger: {
      ...originalWorkflow.trigger,
      allowedBranches,
      allowedRepositories: [REPOSITORY],
    },
  };
}

const workflowA = makeWorkflow("dedup-main", "/webhooks/dedup-main");

const workflowB = makeWorkflow("dedup-secondary", "/webhooks/dedup-secondary");

const startupFailureWorkflow = makeWorkflow(
  "dedup-startup",
  "/webhooks/dedup-startup",
  ["main", "feature"],
);

let server: Server | undefined;
let base = "";

function makePayload(branch = "main", repository = REPOSITORY) {
  return {
    ref: `refs/heads/${branch}`,
    after: SHA,
    deleted: false,
    repository: {
      full_name: repository,
    },
  };
}

async function sendPush(
  endpoint: string,
  deliveryId: string,
  branch = "main",
  repository = REPOSITORY,
): Promise<Response> {
  const body = JSON.stringify(makePayload(branch, repository));

  const signature =
    "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");

  return fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": "push",
      "X-GitHub-Delivery": deliveryId,
      "X-Hub-Signature-256": signature,
    },
    body,
  });
}

async function getMetrics(endpoint: string): Promise<Metrics> {
  const response = await fetch(`${base}${endpoint}/metrics`);

  assert.equal(response.status, 200, "Metrics endpoint should return HTTP 200");

  return (await response.json()) as Metrics;
}

async function waitForCompletedRuns(
  endpoint: string,
  expectedRuns: number,
): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics(endpoint);

    if (
      metrics.totalRuns === expectedRuns &&
      metrics.successfulRuns === expectedRuns &&
      metrics.activeRuns === 0
    ) {
      return;
    }

    await sleep(50);
  }

  const actual = await getMetrics(endpoint);

  throw new Error(
    `Expected ${expectedRuns} successful runs, got ${JSON.stringify(actual)}`,
  );
}

async function assertRunCount(
  endpoint: string,
  expected: number,
): Promise<void> {
  const metrics = await getMetrics(endpoint);

  assert.equal(
    metrics.totalRuns,
    expected,
    `Unexpected completed run count for ${endpoint}`,
  );

  assert.equal(
    metrics.activeRuns,
    0,
    "No unexpected pipelines should be active",
  );
}

try {
  // Import after setting the webhook secret.
  const { createWebhookRouter } = await import("../routes/webhook.routes.js");

  const app = express();

  app.use(createWebhookRouter([workflowA, workflowB, startupFailureWorkflow]));

  server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;

  const pathA = workflowA.webhook.url;
  const pathB = workflowB.webhook.url;
  const failurePath = startupFailureWorkflow.webhook.url;

  // TEST 1 — First delivery executes
  {
    const response = await sendPush(pathA, "delivery-001");

    assert.equal(response.status, 200);

    await waitForCompletedRuns(pathA, 1);

    console.log("Test 1 passed: First delivery executed");
  }

  // TEST 2 — Repeated delivery is ignored
  {
    const response = await sendPush(pathA, "delivery-001");

    assert.equal(response.status, 200);

    await sleep(150);
    await assertRunCount(pathA, 1);

    console.log("Test 2 passed: Sequential duplicate ignored");
  }

  // TEST 3 — Concurrent duplicates start one run
  {
    const responses = await Promise.all([
      sendPush(pathA, "delivery-concurrent-001"),
      sendPush(pathA, "delivery-concurrent-001"),
      sendPush(pathA, "delivery-concurrent-001"),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 200);
    }

    await waitForCompletedRuns(pathA, 2);

    await sleep(150);
    await assertRunCount(pathA, 2);

    console.log("Test 3 passed: Concurrent duplicates ignored");
  }

  // TEST 4 — Rejected branch does not consume ID
  {
    const deliveryId = "delivery-branch-retry";

    const rejected = await sendPush(pathA, deliveryId, "develop");

    assert.equal(rejected.status, 200);
    await assertRunCount(pathA, 2);

    const accepted = await sendPush(pathA, deliveryId, "main");

    assert.equal(accepted.status, 200);

    await waitForCompletedRuns(pathA, 3);

    console.log("Test 4 passed: Rejected branch did not consume ID");
  }

  // TEST 5 — Rejected repository does not consume ID
  {
    const deliveryId = "delivery-repo-retry";

    const rejected = await sendPush(
      pathA,
      deliveryId,
      "main",
      "attacker/untrusted-repository",
    );

    assert.equal(rejected.status, 200);
    await assertRunCount(pathA, 3);

    const accepted = await sendPush(pathA, deliveryId, "main", REPOSITORY);

    assert.equal(accepted.status, 200);

    await waitForCompletedRuns(pathA, 4);

    console.log("Test 5 passed: Rejected repository did not consume ID");
  }

  // TEST 6 — Different delivery IDs remain independent
  {
    const responses = await Promise.all([
      sendPush(pathA, "delivery-new-001"),
      sendPush(pathA, "delivery-new-002"),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 200);
    }

    await waitForCompletedRuns(pathA, 6);

    console.log("Test 6 passed: Different deliveries executed");
  }

  // TEST 7 — Same delivery ID across workflows
  {
    const deliveryId = "delivery-shared-001";

    const responses = await Promise.all([
      sendPush(pathA, deliveryId),
      sendPush(pathB, deliveryId),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 200);
    }

    await waitForCompletedRuns(pathA, 7);
    await waitForCompletedRuns(pathB, 1);

    console.log("Test 7 passed: Workflow delivery keys isolated");
  }

  // TEST 8 — Startup failure releases delivery key
  {
    const deliveryId = "delivery-startup-retry";

    // "feature" passes this workflow's branch allowlist,
    // but the existing environment resolver does not
    // support it. Pipeline startup should throw.
    const failed = await sendPush(failurePath, deliveryId, "feature");

    assert.equal(failed.status, 500, "Unsupported branch should fail startup");

    await assertRunCount(failurePath, 0);

    // Retry the same delivery ID with supported branch.
    // This verifies startup failure removed the key.
    const retry = await sendPush(failurePath, deliveryId, "main");

    assert.equal(retry.status, 200);

    await waitForCompletedRuns(failurePath, 1);

    console.log("Test 8 passed: Startup failure allows retry");
  }

  console.log("ALL DAY 7 DELIVERY DEDUPLICATION TESTS PASSED!");
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
}
