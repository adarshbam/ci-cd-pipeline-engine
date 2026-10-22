import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import express from "express";

import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";

const TEST_SECRET = "day7-local-test-secret";

const previousSecret = process.env.GITHUB_WEBHOOK_SECRET;

process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;

const workflow = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-github.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

const app = express();
app.use(createWebhookRouter([workflow]));

const server = app.listen(0, "127.0.0.1");

interface ResponseBody {
  received?: boolean;
  event?: string;
  deliveryId?: string;
  error?: string;
  runId?: string;
}

function sign(body: string, secret: string = TEST_SECRET): string {
  return (
    "sha256=" +
    createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex")
  );
}

const pushPayload = {
  ref: "refs/heads/main",
  after: "2222222222222222222222222222222222222222",
  repository: {
    full_name: "example/day7-project",
  },
};

let base = "";

async function send(
  body: string,
  options: {
    event?: string;
    deliveryId?: string;
    signature?: string | null;
    contentType?: string;
  } = {},
): Promise<{
  status: number;
  body: ResponseBody;
}> {
  const headers: Record<string, string> = {
    "Content-Type": options.contentType ?? "application/json",
  };

  if (options.event !== "") {
    headers["X-GitHub-Event"] = options.event ?? "push";
  }

  if (options.deliveryId !== "") {
    headers["X-GitHub-Delivery"] = options.deliveryId ?? "delivery-001";
  }

  if (options.signature !== null) {
    headers["X-Hub-Signature-256"] = options.signature ?? sign(body);
  }

  const response = await fetch(`${base}/webhooks/day7-github`, {
    method: "POST",
    headers,
    body,
  });

  return {
    status: response.status,
    body: (await response.json()) as ResponseBody,
  };
}

try {
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;

  const validBody = JSON.stringify(pushPayload);

  // TEST 1 — Valid signed webhook
  {
    const response = await send(validBody);

    assert.equal(response.status, 200);
    assert.equal(response.body.received, true);
    assert.equal(response.body.event, "push");

    assert.equal(response.body.deliveryId, "delivery-001");

    assert.equal(response.body.runId, undefined);

    console.log("Test 1 passed: Valid signed webhook accepted");
  }

  // TEST 2 — Signed ping event
  {
    const pingBody = JSON.stringify({
      zen: "GitHub webhook ready",
    });

    const response = await send(pingBody, {
      event: "ping",
      deliveryId: "delivery-002",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.event, "ping");

    console.log("Test 2 passed: Signed ping event accepted");
  }

  // TEST 3 — Missing required headers
  {
    const missingEvent = await send(validBody, {
      event: "",
    });

    assert.equal(missingEvent.status, 400);

    const missingDelivery = await send(validBody, {
      deliveryId: "",
    });

    assert.equal(missingDelivery.status, 400);

    console.log("Test 3 passed: Missing headers rejected");
  }

  // TEST 4 — Missing signature
  {
    const response = await send(validBody, {
      signature: null,
    });

    assert.equal(response.status, 401);

    console.log("Test 4 passed: Missing signature rejected");
  }

  // TEST 5 — Incorrect secret
  {
    const response = await send(validBody, {
      signature: sign(validBody, "wrong-secret"),
    });

    assert.equal(response.status, 401);

    console.log("Test 5 passed: Incorrect secret rejected");
  }

  // TEST 6 — Tampered payload
  {
    const signature = sign(validBody);

    const tamperedBody = JSON.stringify({
      ...pushPayload,
      ref: "refs/heads/develop",
    });

    const response = await send(tamperedBody, {
      signature,
    });

    assert.equal(response.status, 401);

    console.log("Test 6 passed: Tampered payload rejected");
  }

  // TEST 7 — Malformed or incorrect-length signature
  {
    const malformed = await send(validBody, {
      signature: "sha256=invalid",
    });

    assert.equal(malformed.status, 401);

    const wrongLength = await send(validBody, {
      signature: "sha256=abc123",
    });

    assert.equal(wrongLength.status, 401);

    console.log("Test 7 passed: Malformed signatures rejected");
  }

  // TEST 8 — Invalid JSON with valid signature
  {
    const invalidJSON = '{"repository":';

    const response = await send(invalidJSON);

    assert.equal(response.status, 400);

    console.log("Test 8 passed: Invalid JSON rejected");
  }

  // TEST 9 — Unsupported content type
  {
    const response = await send(validBody, {
      contentType: "text/plain",
    });

    assert.equal(response.status, 415);

    console.log("Test 9 passed: Unsupported content type rejected");
  }

  // TEST 10 — Missing configured secret
  {
    delete process.env.GITHUB_WEBHOOK_SECRET;

    try {
      const response = await send(validBody);

      assert.equal(response.status, 503);
    } finally {
      process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
    }

    console.log("Test 10 passed: Missing secret fails closed");
  }

  console.log("ALL DAY 7 GITHUB WEBHOOK SECURITY TESTS PASSED!");
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
