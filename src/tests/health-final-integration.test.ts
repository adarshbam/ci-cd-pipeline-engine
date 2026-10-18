import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import type { Workflow } from "../workflow/workflow.js";
import { createWebhookRouter } from "../routes/webhook.routes.js";

type JobSnapshot = {
  jobId: string;
  status: string;
};

type RunResponse = {
  runId: string;
  pipelineId: string;
  status: string;
  jobs?: Record<string, JobSnapshot>;
};

const requests = new Map<string, number>();

function getCount(path: string): number {
  return requests.get(path) ?? 0;
}

// Simulated deployed application
const healthServer = createServer((req, res) => {
  const path = req.url ?? "/";
  const count = getCount(path) + 1;

  requests.set(path, count);

  switch (path) {
    case "/test":
      res.writeHead(200);
      res.end("TEST healthy");
      return;

    case "/prod":
      res.writeHead(204);
      res.end();
      return;

    case "/flaky":
      res.writeHead(count >= 3 ? 200 : 503);
      res.end();
      return;

    case "/down":
      res.writeHead(503);
      res.end("Unavailable");
      return;

    case "/never":
      res.writeHead(500);
      res.end("Should not be called");
      return;

    default:
      res.writeHead(404);
      res.end();
  }
});

await new Promise<void>((resolve) => {
  healthServer.listen(0, "127.0.0.1", resolve);
});

const healthAddress = healthServer.address() as AddressInfo;

const healthBase = `http://127.0.0.1:${healthAddress.port}`;

function makeWorkflow(
  name: string,
  options: {
    healthPath?: string;
    healthCheck?: boolean;
    command?: string;
    legacy?: boolean;
  } = {},
): Workflow {
  const {
    healthPath,
    healthCheck = true,
    command = "echo deployed",
    legacy = false,
  } = options;

  return {
    name,
    webhook: {
      url: `/test/${name}`,
    },
    trigger: {
      events: ["push"],
    },
    ...(legacy
      ? {}
      : {
          environments: {
            test: {
              healthUrl: `${healthBase}${healthPath ?? "/test"}`,
            },
            prod: {
              healthUrl: `${healthBase}${healthPath ?? "/prod"}`,
            },
          },
        }),
    jobs: {
      deploy: {
        ...(healthCheck ? { healthCheck: true } : {}),
        steps: [
          {
            name: "Deploy application",
            run: command,
          },
        ],
      },

      audit: {
        steps: [
          {
            name: "Independent audit",
            run: "echo audit-ok",
          },
        ],
      },

      postdeploy: {
        needs: ["deploy"],
        steps: [
          {
            name: "Verify deployed application",
            run: "echo postdeploy-ok",
          },
        ],
      },
    },
  } as Workflow;
}

const workflows: Workflow[] = [
  makeWorkflow("healthy-test"),
  makeWorkflow("healthy-prod"),
  makeWorkflow("flaky", {
    healthPath: "/flaky",
  }),
  makeWorkflow("unhealthy", {
    healthPath: "/down",
  }),
  makeWorkflow("command-fails", {
    healthPath: "/never",
    command: "exit 1",
  }),
  makeWorkflow("legacy", {
    legacy: true,
    healthCheck: false,
  }),
];

const app = express();

app.use(createWebhookRouter(workflows));

const apiServer = app.listen(0, "127.0.0.1");

await new Promise<void>((resolve) => {
  if (apiServer.listening) {
    resolve();
  } else {
    apiServer.once("listening", resolve);
  }
});

const apiAddress = apiServer.address() as AddressInfo;

const apiBase = `http://127.0.0.1:${apiAddress.port}`;

async function startAndWait(
  name: string,
  branch?: string,
): Promise<RunResponse> {
  const endpoint = `/test/${name}`;

  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";

  const response = await fetch(`${apiBase}${endpoint}${query}`);

  assert.equal(response.status, 202);

  const started = (await response.json()) as RunResponse;

  assert.ok(started.runId);
  assert.equal(started.pipelineId, name);

  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const statusResponse = await fetch(
      `${apiBase}${endpoint}/runs/${started.runId}`,
    );

    assert.equal(statusResponse.status, 200);

    const run = (await statusResponse.json()) as RunResponse;

    if (run.status === "SUCCESS" || run.status === "FAILED") {
      return run;
    }

    await sleep(25);
  }

  throw new Error(`Pipeline ${name} timed out`);
}

try {
  // TEST 1 — Healthy TEST deployment
  {
    const run = await startAndWait("healthy-test", "develop");

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs?.deploy?.status, "SUCCESS");
    assert.equal(run.jobs?.postdeploy?.status, "SUCCESS");
    assert.equal(getCount("/test"), 1);

    console.log("Test 1 passed: Healthy TEST deployment");
  }

  // TEST 2 — Healthy PROD deployment
  {
    const run = await startAndWait("healthy-prod", "main");

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs?.deploy?.status, "SUCCESS");
    assert.equal(getCount("/prod"), 1);

    console.log("Test 2 passed: Healthy PROD deployment");
  }

  // TEST 3 — Retry recovery
  {
    const run = await startAndWait("flaky", "develop");

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs?.deploy?.status, "SUCCESS");
    assert.equal(getCount("/flaky"), 3);

    console.log("Test 3 passed: Deployment recovers after retries");
  }

  // TEST 4 — Unhealthy deployment propagation
  {
    const run = await startAndWait("unhealthy", "develop");

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs?.deploy?.status, "FAILED");
    assert.equal(run.jobs?.postdeploy?.status, "SKIPPED");
    assert.equal(run.jobs?.audit?.status, "SUCCESS");
    assert.equal(getCount("/down"), 3);

    console.log("Test 4 passed: Health failure propagates");
  }

  // TEST 5 — Failed command skips health check
  {
    const run = await startAndWait("command-fails", "develop");

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs?.deploy?.status, "FAILED");
    assert.equal(run.jobs?.postdeploy?.status, "SKIPPED");
    assert.equal(getCount("/never"), 0);

    console.log("Test 5 passed: Failed deployment skips health check");
  }

  // TEST 6 — Legacy workflow stays compatible
  {
    const run = await startAndWait("legacy");

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs?.deploy?.status, "SUCCESS");
    assert.equal(run.jobs?.postdeploy?.status, "SUCCESS");

    const missing = await fetch(`${apiBase}/test/legacy/runs/unknown-id`);

    assert.equal(missing.status, 404);

    console.log("Test 6 passed: Legacy workflow remains compatible");
  }

  console.log("All Final Health Integration tests passed!");
} finally {
  apiServer.closeAllConnections();
  healthServer.closeAllConnections();

  await Promise.all([
    new Promise<void>((resolve, reject) => {
      apiServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
    new Promise<void>((resolve, reject) => {
      healthServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  ]);
}
