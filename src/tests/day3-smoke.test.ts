import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";

type Snapshot = {
  runId: string;
  pipelineId: string;
  status: string;
  jobs: Record<string, { status: string }>;
};

const workflows = [
  {
    name: "smoke-success",
    webhook: { url: "/smoke/success" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "echo build-ok" }],
      },
      test: {
        needs: ["build"],
        steps: [{ name: "Test", run: "echo test-ok" }],
      },
    },
  },
  {
    name: "smoke-failure",
    webhook: { url: "/smoke/failure" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "exit 1" }],
      },
      deploy: {
        needs: ["build"],
        steps: [{ name: "Deploy", run: "echo should-not-run" }],
      },
    },
  },
] as Workflow[];

const app = express();
app.use(createWebhookRouter(workflows));

const server = app.listen(0, "127.0.0.1");

await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

const address = server.address();
assert.ok(address && typeof address !== "string");

const base = `http://127.0.0.1:${address.port}`;

async function executeAndPoll(path: string): Promise<Snapshot> {
  const response = await fetch(base + path);
  assert.equal(response.status, 202);

  const started = (await response.json()) as { runId: string };
  assert.ok(started.runId);

  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await fetch(`${base}${path}/runs/${started.runId}`);

    assert.equal(result.status, 200);

    const snapshot = (await result.json()) as Snapshot;

    if (snapshot.status === "SUCCESS" || snapshot.status === "FAILED") {
      return snapshot;
    }

    await sleep(100);
  }

  throw new Error(`Pipeline timed out: ${path}`);
}

try {
  // Test 1: Successful pipeline
  const success = await executeAndPoll("/smoke/success");

  assert.equal(success.status, "SUCCESS");
  assert.equal(success.jobs.build?.status, "SUCCESS");
  assert.equal(success.jobs.test?.status, "SUCCESS");

  console.log("PASS: Complete successful pipeline");

  // Test 2: Failed pipeline and dependency propagation
  const failed = await executeAndPoll("/smoke/failure");

  assert.equal(failed.status, "FAILED");
  assert.equal(failed.jobs.build?.status, "FAILED");
  assert.equal(failed.jobs.deploy?.status, "SKIPPED");

  console.log("PASS: Failure and dependency propagation");

  // Test 3: Runs have independent IDs
  assert.notEqual(success.runId, failed.runId);

  console.log("PASS: Independent execution IDs");
  console.log("All Day 3 smoke tests passed!");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
