import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

interface WebhookResponse {
  received?: boolean;
  event?: string;
  deliveryId?: string;
  error?: string;
  runId?: string;
}

const app = express();

// The webhook router is responsible for parsing raw
// GitHub requests. Do not add express.json() before it.
app.use(createWebhookRouter([workflow]));

const server = app.listen(0, "127.0.0.1");

await once(server, "listening");

const address = server.address() as AddressInfo;

const base = `http://127.0.0.1:${address.port}`;

const webhookUrl = `${base}/webhooks/day7-github`;

const pushPayload = {
  ref: "refs/heads/main",
  before: "1111111111111111111111111111111111111111",
  after: "2222222222222222222222222222222222222222",
  repository: {
    id: 12345,
    full_name: "example/day7-project",
    clone_url: "https://github.com/example/day7-project.git",
  },
  pusher: {
    name: "test-developer",
  },
};

async function sendWebhook(
  body: string,
  headers: Record<string, string>,
): Promise<{
  status: number;
  body: WebhookResponse;
}> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body,
  });

  const result = (await response.json()) as WebhookResponse;

  return {
    status: response.status,
    body: result,
  };
}

try {
  // TEST 1 — A valid GitHub push is acknowledged
  const push = await sendWebhook(JSON.stringify(pushPayload), {
    "Content-Type": "application/json",
    "X-GitHub-Event": "push",
    "X-GitHub-Delivery": "delivery-001",
  });

  assert.equal(push.status, 200);
  assert.equal(push.body.received, true);

  console.log("Test 1 passed: Valid GitHub push acknowledged");

  // TEST 2 — Event and delivery metadata preserved
  assert.equal(push.body.event, "push");
  assert.equal(push.body.deliveryId, "delivery-001");

  // Parsing a request must not trigger a pipeline yet.
  assert.equal(push.body.runId, undefined);

  console.log("Test 2 passed: GitHub request metadata parsed");

  // TEST 3 — Other valid GitHub events are parsed.
  // Event filtering comes in exercise 7.2.4.
  const ping = await sendWebhook(
    JSON.stringify({ zen: "GitHub webhook ready" }),
    {
      "Content-Type": "application/json",
      "X-GitHub-Event": "ping",
      "X-GitHub-Delivery": "delivery-002",
    },
  );

  assert.equal(ping.status, 200);
  assert.equal(ping.body.received, true);
  assert.equal(ping.body.event, "ping");
  assert.equal(ping.body.deliveryId, "delivery-002");

  console.log("Test 3 passed: Different GitHub events parsed");

  // TEST 4 — Malformed JSON is rejected
  const malformed = await sendWebhook('{"repository":', {
    "Content-Type": "application/json",
    "X-GitHub-Event": "push",
    "X-GitHub-Delivery": "delivery-003",
  });

  assert.equal(malformed.status, 400);
  assert.equal(typeof malformed.body.error, "string");

  console.log("Test 4 passed: Malformed JSON rejected");

  // TEST 5 — Required GitHub headers are validated
  const missingEvent = await sendWebhook(JSON.stringify(pushPayload), {
    "Content-Type": "application/json",
    "X-GitHub-Delivery": "delivery-004",
  });

  assert.equal(missingEvent.status, 400);

  const missingDelivery = await sendWebhook(JSON.stringify(pushPayload), {
    "Content-Type": "application/json",
    "X-GitHub-Event": "push",
  });

  assert.equal(missingDelivery.status, 400);

  console.log("Test 5 passed: Required GitHub headers validated");

  // TEST 6 — Unsupported content types are rejected
  const wrongContentType = await sendWebhook(JSON.stringify(pushPayload), {
    "Content-Type": "text/plain",
    "X-GitHub-Event": "push",
    "X-GitHub-Delivery": "delivery-005",
  });

  assert.equal(wrongContentType.status, 415);
  assert.equal(typeof wrongContentType.body.error, "string");

  console.log("Test 6 passed: Unsupported content type rejected");

  console.log("ALL DAY 7 GITHUB WEBHOOK PARSING TESTS PASSED!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
