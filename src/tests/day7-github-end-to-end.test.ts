import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-e2e-webhook-secret";
const TOKEN = "day7-e2e-github-token";
const REPOSITORY = "example/day7-project";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const SHA_D = "d".repeat(40);
const SHA_E = "e".repeat(40);

const previousEnvironment = {
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  token: process.env.GITHUB_TOKEN,
  apiBase: process.env.GITHUB_API_BASE_URL,
};

interface GitHubReport {
  path: string;
  authorization: string | undefined;
  state: string;
  context: string | undefined;
}

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

const reports: GitHubReport[] = [];

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
    });

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

// Use real pipeline execution, not mocked jobs.
const successWorkflow: Workflow = {
  ...originalWorkflow,
  jobs: {
    build: {
      steps: [
        {
          name: "Build",
          run: "sleep 0.75; echo build-completed",
        },
      ],
    },
    test: {
      needs: ["build"],
      steps: [
        {
          name: "Test",
          run: "echo tests-passed",
        },
      ],
    },
  },
};

const failureWorkflow: Workflow = {
  ...originalWorkflow,
  name: "day7-e2e-failure",
  webhook: {
    ...originalWorkflow.webhook,
    url: "/webhooks/day7-e2e-failure",
  },
  jobs: {
    build: {
      steps: [
        {
          name: "Fail Build",
          run: "exit 1",
        },
      ],
    },
    test: {
      needs: ["build"],
      steps: [
        {
          name: "Should Be Skipped",
          run: "echo must-not-run",
        },
      ],
    },
  },
};

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

interface PushOptions {
  endpoint?: string;
  deliveryId: string;
  sha: string;
  branch?: string;
  repository?: string;
  validSignature?: boolean;
}

async function sendPush({
  endpoint = successWorkflow.webhook.url,
  deliveryId,
  sha,
  branch = "main",
  repository = REPOSITORY,
  validSignature = true,
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
      "X-Hub-Signature-256": validSignature
        ? sign(body)
        : `sha256=${"0".repeat(64)}`,
    },
    body,
  });
}

function reportsFor(sha: string): GitHubReport[] {
  return reports.filter((report) => report.path.endsWith(`/statuses/${sha}`));
}

async function waitForReports(
  sha: string,
  expectedCount: number,
): Promise<GitHubReport[]> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const matching = reportsFor(sha);

    if (matching.length >= expectedCount) {
      return matching;
    }

    await sleep(25);
  }

  throw new Error(`Timed out waiting for GitHub reports: ${sha}`);
}

async function getMetrics(endpoint: string): Promise<Metrics> {
  const response = await fetch(`${base}${endpoint}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
}

async function waitForMetrics(
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

  throw new Error(`Timed out waiting for metrics: ${endpoint}`);
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
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
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

  app.use(createWebhookRouter([successWorkflow, failureWorkflow]));

  appServer = app.listen(0, "127.0.0.1");
  await once(appServer, "listening");

  const appAddress = appServer.address() as AddressInfo;

  base = `http://127.0.0.1:${appAddress.port}`;

  // TEST 1 — Valid push acknowledged while running
  {
    const response = await sendPush({
      deliveryId: "e2e-success-001",
      sha: SHA_A,
    });

    assert.equal(response.status, 200);

    const metrics = await getMetrics(successWorkflow.webhook.url);

    assert.equal(metrics.activeRuns, 1);

    assert.deepEqual(
      reportsFor(SHA_A).map((r) => r.state),
      ["pending"],
    );

    console.log("Test 1 passed: Signed push acknowledged asynchronously");
  }

  // TEST 2 — Successful pipeline reports final status
  {
    const matching = await waitForReports(SHA_A, 2);

    assert.deepEqual(
      matching.map((r) => r.state),
      ["pending", "success"],
    );

    for (const report of matching) {
      assert.equal(report.path, `/repos/${REPOSITORY}/statuses/${SHA_A}`);

      assert.equal(report.authorization, `Bearer ${TOKEN}`);

      assert.equal(report.context, "custom-ci/pipeline");
    }

    const metrics = await waitForMetrics(successWorkflow.webhook.url, 1);

    assert.equal(metrics.successfulRuns, 1);
    assert.equal(metrics.failedRuns, 0);

    console.log("Test 2 passed: Build, test and GitHub success completed");
  }

  // TEST 3 — Failed pipeline reports failure
  {
    const response = await sendPush({
      endpoint: failureWorkflow.webhook.url,
      deliveryId: "e2e-failure-001",
      sha: SHA_B,
    });

    assert.equal(response.status, 200);

    const matching = await waitForReports(SHA_B, 2);

    assert.deepEqual(
      matching.map((r) => r.state),
      ["pending", "failure"],
    );

    const metrics = await waitForMetrics(failureWorkflow.webhook.url, 1);

    assert.equal(metrics.failedRuns, 1);
    assert.equal(metrics.successfulRuns, 0);

    console.log("Test 3 passed: Failure propagated to GitHub");
  }

  // TEST 4 — Duplicate delivery does not rerun
  {
    const response = await sendPush({
      deliveryId: "e2e-success-001",
      sha: SHA_A,
    });

    assert.equal(response.status, 200);

    assert.equal(reportsFor(SHA_A).length, 2);

    const metrics = await getMetrics(successWorkflow.webhook.url);

    assert.equal(metrics.totalRuns, 1);

    console.log("Test 4 passed: Duplicate delivery ignored");
  }

  // TEST 5 — Unauthorized and filtered pushes ignored
  {
    const invalidSignature = await sendPush({
      deliveryId: "e2e-invalid-signature",
      sha: SHA_E,
      validSignature: false,
    });

    assert.ok(invalidSignature.status >= 400 && invalidSignature.status < 500);

    const wrongBranch = await sendPush({
      deliveryId: "e2e-wrong-branch",
      sha: SHA_D,
      branch: "develop",
    });

    const wrongRepository = await sendPush({
      deliveryId: "e2e-wrong-repository",
      sha: SHA_D,
      repository: "attacker/untrusted",
    });

    assert.equal(wrongBranch.status, 200);
    assert.equal(wrongRepository.status, 200);

    assert.equal(reportsFor(SHA_D).length, 0);
    assert.equal(reportsFor(SHA_E).length, 0);

    const metrics = await getMetrics(successWorkflow.webhook.url);

    assert.equal(metrics.totalRuns, 1);

    console.log("Test 5 passed: Invalid signatures and filters enforced");
  }

  // TEST 6 — Independent pushes execute concurrently
  {
    const [first, second] = await Promise.all([
      sendPush({
        deliveryId: "e2e-concurrent-001",
        sha: SHA_C,
      }),
      sendPush({
        deliveryId: "e2e-concurrent-002",
        sha: SHA_D,
      }),
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    await Promise.all([waitForReports(SHA_C, 2), waitForReports(SHA_D, 2)]);

    assert.deepEqual(
      reportsFor(SHA_C).map((r) => r.state),
      ["pending", "success"],
    );

    assert.deepEqual(
      reportsFor(SHA_D).map((r) => r.state),
      ["pending", "success"],
    );

    const metrics = await waitForMetrics(successWorkflow.webhook.url, 3);

    assert.equal(metrics.successfulRuns, 3);

    console.log("Test 6 passed: Independent GitHub pushes completed");
  }

  // TEST 7 — Separate workflows preserve isolation
  {
    const successMetrics = await getMetrics(successWorkflow.webhook.url);

    const failureMetrics = await getMetrics(failureWorkflow.webhook.url);

    assert.equal(successMetrics.totalRuns, 3);
    assert.equal(successMetrics.successfulRuns, 3);
    assert.equal(successMetrics.failedRuns, 0);

    assert.equal(failureMetrics.totalRuns, 1);
    assert.equal(failureMetrics.successfulRuns, 0);
    assert.equal(failureMetrics.failedRuns, 1);

    console.log("Test 7 passed: Workflow metrics remain isolated");
  }

  // TEST 8 — Unauthenticated GET cannot trigger jobs
  {
    const before = await getMetrics(successWorkflow.webhook.url);

    const response = await fetch(`${base}${successWorkflow.webhook.url}`);

    assert.equal(response.status, 404);

    const after = await getMetrics(successWorkflow.webhook.url);

    assert.deepEqual(after, before);

    console.log("Test 8 passed: Unauthenticated GET trigger disabled");
  }

  console.log("ALL DAY 7 GITHUB END-TO-END TESTS PASSED!");
} finally {
  if (appServer) {
    await closeServer(appServer);
  }

  await closeServer(githubServer);

  restore("GITHUB_WEBHOOK_SECRET", previousEnvironment.secret);

  restore("GITHUB_TOKEN", previousEnvironment.token);

  restore("GITHUB_API_BASE_URL", previousEnvironment.apiBase);
}
