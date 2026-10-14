import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Workflow } from "../workflow/workflow.js";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import { once } from "node:events";

type RunResponse = {
  runId: string;
  pipelineId: string;
  status: string;
  jobs?: Record<
    string,
    {
      jobId: string;
      status: string;
    }
  >;
};

const successWorkflow = {
  name: "api-success",
  webhook: { url: "/test/api-success" },
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
} as Workflow;

const failureWorkflow = {
  name: "api-failure",
  webhook: { url: "/test/api-failure" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Build", run: "exit 1" }],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Test", run: "echo test-ok" }],
    },
  },
} as Workflow;

const app = express();
app.use(createWebhookRouter([successWorkflow, failureWorkflow]));

const server = app.listen(0, "127.0.0.1");

await once(server, "listening");

const address = server.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}`;

async function waitForCompletion(
  endpoint: string,
  runId: string,
): Promise<RunResponse> {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const response = await fetch(`${base}${endpoint}/runs/${runId}`);

    assert.equal(response.status, 200);

    const run = (await response.json()) as RunResponse;

    if (run.status === "SUCCESS" || run.status === "FAILED") {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Pipeline did not finish in time");
}

try {
  // Test 1: Start a successful pipeline.
  const startResponse = await fetch(`${base}/test/api-success`);

  assert.equal(startResponse.status, 202);

  const started = (await startResponse.json()) as RunResponse;

  assert.ok(started.runId);
  assert.equal(started.pipelineId, "api-success");

  console.log("Test 1 passed: Pipeline started");

  // Test 2: Retrieve and complete the pipeline.
  const completed = await waitForCompletion("/test/api-success", started.runId);

  assert.equal(completed.status, "SUCCESS");
  assert.equal(completed.pipelineId, "api-success");

  console.log("Test 2 passed: Pipeline completed");

  // Test 3: Verify dependency execution.
  assert.equal(completed.jobs?.build?.status, "SUCCESS");
  assert.equal(completed.jobs?.test?.status, "SUCCESS");

  console.log("Test 3 passed: Dependency jobs succeeded");

  // Test 4: Failed job propagates to dependent job.
  const failureResponse = await fetch(`${base}/test/api-failure`);

  assert.equal(failureResponse.status, 202);

  const failureStart = (await failureResponse.json()) as RunResponse;

  const failed = await waitForCompletion(
    "/test/api-failure",
    failureStart.runId,
  );

  assert.equal(failed.status, "FAILED");
  assert.equal(failed.jobs?.build?.status, "FAILED");
  assert.equal(failed.jobs?.test?.status, "SKIPPED");

  console.log("Test 4 passed: Failure propagated");

  // Test 5: Unknown run returns 404.
  const missing = await fetch(`${base}/test/api-success/runs/unknown-run-id`);

  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    error: "Run not found",
  });

  console.log("Test 5 passed: Unknown run handled");

  // Test 6: Starting again creates a different run.
  const secondResponse = await fetch(`${base}/test/api-success`);

  assert.equal(secondResponse.status, 202);

  const second = (await secondResponse.json()) as RunResponse;

  assert.notEqual(second.runId, started.runId);

  const secondCompleted = await waitForCompletion(
    "/test/api-success",
    second.runId,
  );

  assert.equal(secondCompleted.status, "SUCCESS");

  console.log("Test 6 passed: Independent runs");

  console.log("All Final API Integration tests passed!");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
