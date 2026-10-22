import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";

import type { Workflow } from "../workflow/workflow.js";

const SECRET = "day7-final-status-secret";
const TOKEN = "day7-final-status-token";
const REPOSITORY = "example/day7-project";
const SUCCESS_SHA = "a".repeat(40);
const FAILURE_SHA = "b".repeat(40);
const SECOND_SHA = "c".repeat(40);

const previousEnv = {
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  token: process.env.GITHUB_TOKEN,
  apiBase: process.env.GITHUB_API_BASE_URL,
};

type GitHubState = "pending" | "success" | "failure" | "error";

interface StatusReport {
  path: string;
  authorization: string | undefined;
  state: GitHubState;
  context: string | undefined;
}

interface Metrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
}

const reports: StatusReport[] = [];

let appServer: Server | undefined;
let base = "";

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
      state: body.state as GitHubState,
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

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

async function sendPush(
  endpoint: string,
  deliveryId: string,
  sha: string,
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

  return fetch(`${base}${endpoint}`, {
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

function getReportsForSha(sha: string): StatusReport[] {
  return reports.filter((report) => report.path.endsWith(`/statuses/${sha}`));
}

async function waitForReports(
  sha: string,
  expectedCount: number,
): Promise<StatusReport[]> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const matching = getReportsForSha(sha);

    if (matching.length >= expectedCount) {
      return matching;
    }

    await sleep(25);
  }

  throw new Error(
    `Expected ${expectedCount} reports for ${sha}, ` +
      `received ${getReportsForSha(sha).length}`,
  );
}

async function getMetrics(endpoint: string): Promise<Metrics> {
  const response = await fetch(`${base}${endpoint}/metrics`);

  assert.equal(response.status, 200);

  return (await response.json()) as Metrics;
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

function restoreEnvironment(key: string, value: string | undefined): void {
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

  // TEST 1 — Successful pipeline reports pending -> success
  {
    const response = await sendPush(
      successWorkflow.webhook.url,
      "final-success-001",
      SUCCESS_SHA,
    );

    assert.equal(response.status, 200);

    const matching = await waitForReports(SUCCESS_SHA, 2);

    assert.deepEqual(
      matching.map((report) => report.state),
      ["pending", "success"],
    );

    console.log(
      "Test 1 passed: Successful pipeline reports pending then success",
    );
  }

  // TEST 2 — GitHub API request preserves metadata
  {
    const matching = getReportsForSha(SUCCESS_SHA);

    assert.equal(matching.length, 2);

    for (const report of matching) {
      assert.equal(report.path, `/repos/${REPOSITORY}/statuses/${SUCCESS_SHA}`);

      assert.equal(report.authorization, `Bearer ${TOKEN}`);

      assert.equal(report.context, "custom-ci/pipeline");
    }

    console.log("Test 2 passed: Both statuses contain correct metadata");
  }

  // TEST 3 — Failed pipeline reports pending -> failure
  {
    const response = await sendPush(
      failureWorkflow.webhook.url,
      "final-failure-001",
      FAILURE_SHA,
    );

    assert.equal(response.status, 200);

    const matching = await waitForReports(FAILURE_SHA, 2);

    assert.deepEqual(
      matching.map((report) => report.state),
      ["pending", "failure"],
    );

    const metrics = await getMetrics(failureWorkflow.webhook.url);

    assert.equal(metrics.totalRuns, 1);
    assert.equal(metrics.failedRuns, 1);

    console.log("Test 3 passed: Failed pipeline reports pending then failure");
  }

  // TEST 4 — Duplicate delivery does not report again
  {
    const response = await sendPush(
      successWorkflow.webhook.url,
      "final-success-001",
      SUCCESS_SHA,
    );

    assert.equal(response.status, 200);

    await sleep(150);

    assert.equal(getReportsForSha(SUCCESS_SHA).length, 2);

    const metrics = await getMetrics(successWorkflow.webhook.url);

    assert.equal(metrics.totalRuns, 1);

    console.log("Test 4 passed: Duplicate delivery creates no extra statuses");
  }

  // TEST 5 — Rejected pushes do not report anything
  {
    const wrongBranch = await sendPush(
      successWorkflow.webhook.url,
      "final-rejected-branch",
      SECOND_SHA,
      "develop",
    );

    const wrongRepository = await sendPush(
      successWorkflow.webhook.url,
      "final-rejected-repository",
      SECOND_SHA,
      "main",
      "attacker/untrusted",
    );

    assert.equal(wrongBranch.status, 200);
    assert.equal(wrongRepository.status, 200);

    assert.equal(getReportsForSha(SECOND_SHA).length, 0);

    console.log("Test 5 passed: Rejected pushes do not report statuses");
  }

  // TEST 6 — Separate delivery sends its own lifecycle
  {
    const response = await sendPush(
      successWorkflow.webhook.url,
      "final-success-002",
      SECOND_SHA,
    );

    assert.equal(response.status, 200);

    const matching = await waitForReports(SECOND_SHA, 2);

    assert.deepEqual(
      matching.map((report) => report.state),
      ["pending", "success"],
    );

    const metrics = await getMetrics(successWorkflow.webhook.url);

    assert.equal(metrics.totalRuns, 2);
    assert.equal(metrics.successfulRuns, 2);

    console.log(
      "Test 6 passed: Independent delivery reports its own lifecycle",
    );
  }

  console.log("ALL DAY 7 GITHUB FINAL STATUS TESTS PASSED!");
} finally {
  if (appServer) {
    await closeServer(appServer);
  }

  await closeServer(githubServer);

  restoreEnvironment("GITHUB_WEBHOOK_SECRET", previousEnv.secret);

  restoreEnvironment("GITHUB_TOKEN", previousEnv.token);

  restoreEnvironment("GITHUB_API_BASE_URL", previousEnv.apiBase);
}
