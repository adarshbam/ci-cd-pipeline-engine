import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-workflow-isolation-secret";

const ALPHA_REPO = "example/alpha-project";
const BETA_REPO = "example/beta-project";

const SHA = "a".repeat(40);

const previousEnv = {
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  token: process.env.GITHUB_TOKEN,
};

const alpha = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-isolation-alpha.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

const beta = JSON.parse(
  await readFile(
    new URL("../../workflows/day7-isolation-beta.json", import.meta.url),
    "utf8",
  ),
) as Workflow;

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  activeRuns: number;
}

interface PushOptions {
  endpoint: string;
  deliveryId: string;
  repository: string;
  branch: string;
  sha?: string;
  invalidSignature?: boolean;
}

let base = "";
let server: Server | undefined;

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

async function sendPush({
  endpoint,
  deliveryId,
  repository,
  branch,
  sha = SHA,
  invalidSignature = false,
}: PushOptions): Promise<Response> {
  const body = JSON.stringify({
    ref: `refs/heads/${branch}`,
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

function alphaPush(
  deliveryId: string,
  overrides: Partial<PushOptions> = {},
): Promise<Response> {
  return sendPush({
    endpoint: alpha.webhook.url,
    deliveryId,
    repository: ALPHA_REPO,
    branch: "main",
    ...overrides,
  });
}

function betaPush(
  deliveryId: string,
  overrides: Partial<PushOptions> = {},
): Promise<Response> {
  return sendPush({
    endpoint: beta.webhook.url,
    deliveryId,
    repository: BETA_REPO,
    branch: "develop",
    ...overrides,
  });
}

async function getMetrics(endpoint: string): Promise<Metrics> {
  const response = await fetch(`${base}${endpoint}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
}

async function waitForRuns(
  endpoint: string,
  expectedTotal: number,
): Promise<Metrics> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const metrics = await getMetrics(endpoint);

    if (metrics.totalRuns === expectedTotal && metrics.activeRuns === 0) {
      return metrics;
    }

    await sleep(25);
  }

  throw new Error(`Timed out waiting for ${expectedTotal} runs at ${endpoint}`);
}

async function expectSuccessfulRuns(
  endpoint: string,
  count: number,
): Promise<void> {
  const metrics = await waitForRuns(endpoint, count);

  assert.equal(metrics.totalRuns, count);
  assert.equal(metrics.successfulRuns, count);
  assert.equal(metrics.failedRuns, 0);
  assert.equal(metrics.activeRuns, 0);
  assert.ok(metrics.averageDurationMs >= 0);
}

async function expectRunCounts(
  alphaCount: number,
  betaCount: number,
): Promise<void> {
  await expectSuccessfulRuns(alpha.webhook.url, alphaCount);
  await expectSuccessfulRuns(beta.webhook.url, betaCount);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

try {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;

  // External GitHub reporting is not under test here.
  delete process.env.GITHUB_TOKEN;

  const { createWebhookRouter } = await import("../routes/webhook.routes.js");

  const app = express();

  app.use(createWebhookRouter([alpha, beta]));

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;

  // TEST 1 — Both workflows start with independent metrics.
  {
    await expectRunCounts(0, 0);

    console.log("Test 1 passed: Workflow metrics initially isolated");
  }

  // TEST 2 — Alpha accepts its own repository and branch.
  {
    const response = await alphaPush("isolation-shared-001");

    assert.equal(response.status, 200);

    await expectRunCounts(1, 0);

    console.log("Test 2 passed: Alpha push executes only Alpha");
  }

  // TEST 3 — Beta accepts its own repository and branch,
  // even when using the same delivery ID as Alpha.
  {
    const response = await betaPush("isolation-shared-001");

    assert.equal(response.status, 200);

    await expectRunCounts(1, 1);

    console.log("Test 3 passed: Beta executes independently");
  }

  // TEST 4 — Cross-repository pushes must be ignored.
  {
    const alphaResponse = await alphaPush("isolation-wrong-repository-alpha", {
      repository: BETA_REPO,
    });

    const betaResponse = await betaPush("isolation-wrong-repository-beta", {
      repository: ALPHA_REPO,
    });

    assert.equal(alphaResponse.status, 200);
    assert.equal(betaResponse.status, 200);

    await expectRunCounts(1, 1);

    console.log("Test 4 passed: Cross-repository execution blocked");
  }

  // TEST 5 — Each workflow enforces its own branch.
  {
    const alphaResponse = await alphaPush("isolation-wrong-branch-alpha", {
      branch: "develop",
    });

    const betaResponse = await betaPush("isolation-wrong-branch-beta", {
      branch: "main",
    });

    assert.equal(alphaResponse.status, 200);
    assert.equal(betaResponse.status, 200);

    await expectRunCounts(1, 1);

    console.log("Test 5 passed: Workflow branch restrictions enforced");
  }

  // TEST 6 — Filtered deliveries remain reusable
  // when resent with the correct repository and branch.
  {
    const alphaId = "isolation-retry-alpha";
    const betaId = "isolation-retry-beta";

    const rejectedAlpha = await alphaPush(alphaId, {
      branch: "develop",
    });

    const rejectedBeta = await betaPush(betaId, {
      repository: ALPHA_REPO,
    });

    assert.equal(rejectedAlpha.status, 200);
    assert.equal(rejectedBeta.status, 200);

    await expectRunCounts(1, 1);

    const [acceptedAlpha, acceptedBeta] = await Promise.all([
      alphaPush(alphaId),
      betaPush(betaId),
    ]);

    assert.equal(acceptedAlpha.status, 200);
    assert.equal(acceptedBeta.status, 200);

    await expectRunCounts(2, 2);

    console.log("Test 6 passed: Filtered delivery IDs remain reusable");
  }

  // TEST 7 — Duplicates are ignored within each workflow.
  {
    const [alphaResponse, betaResponse] = await Promise.all([
      alphaPush("isolation-shared-001"),
      betaPush("isolation-shared-001"),
    ]);

    assert.equal(alphaResponse.status, 200);
    assert.equal(betaResponse.status, 200);

    await expectRunCounts(2, 2);

    console.log("Test 7 passed: Duplicate protection remains workflow-scoped");
  }

  // TEST 8 — Invalid signatures do not execute or
  // consume delivery IDs in either workflow.
  {
    const alphaId = "isolation-invalid-alpha";
    const betaId = "isolation-invalid-beta";

    const [rejectedAlpha, rejectedBeta] = await Promise.all([
      alphaPush(alphaId, {
        invalidSignature: true,
      }),
      betaPush(betaId, {
        invalidSignature: true,
      }),
    ]);

    for (const response of [rejectedAlpha, rejectedBeta]) {
      assert.ok(response.status >= 400 && response.status < 500);
    }

    await expectRunCounts(2, 2);

    const [acceptedAlpha, acceptedBeta] = await Promise.all([
      alphaPush(alphaId),
      betaPush(betaId),
    ]);

    assert.equal(acceptedAlpha.status, 200);
    assert.equal(acceptedBeta.status, 200);

    await expectRunCounts(3, 3);

    console.log("Test 8 passed: Invalid signatures cannot cross workflows");
  }

  // TEST 9 — Both workflows can run concurrently
  // for the same commit SHA, with independent results.
  {
    const sharedSha = "c".repeat(40);

    const [alphaResponse, betaResponse] = await Promise.all([
      alphaPush("isolation-concurrent-alpha", {
        sha: sharedSha,
      }),
      betaPush("isolation-concurrent-beta", {
        sha: sharedSha,
      }),
    ]);

    assert.equal(alphaResponse.status, 200);
    assert.equal(betaResponse.status, 200);

    await expectRunCounts(4, 4);

    console.log("Test 9 passed: Concurrent workflow execution isolated");
  }

  // TEST 10 — Unknown workflow endpoint does not
  // accidentally trigger either existing workflow.
  {
    const response = await sendPush({
      endpoint: "/webhooks/day7-unknown-workflow",
      deliveryId: "isolation-unknown",
      repository: ALPHA_REPO,
      branch: "main",
    });

    assert.equal(response.status, 404);

    await expectRunCounts(4, 4);

    console.log("Test 10 passed: Unknown workflow cannot trigger execution");
  }

  console.log("ALL DAY 7 WORKFLOW ISOLATION TESTS PASSED!");
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

  restoreEnv("GITHUB_WEBHOOK_SECRET", previousEnv.secret);

  restoreEnv("GITHUB_TOKEN", previousEnv.token);
}
