import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import type { Workflow } from "../workflow/workflow.js";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";

// -----------------------------------------
// TYPES
// -----------------------------------------

type JobSnapshot = {
  status: string;
  branch?: string;
  environment?: string;
};

type RunResponse = {
  runId: string;
  pipelineId: string;
  status: string;
  jobs?: Record<string, JobSnapshot>;
};

// -----------------------------------------
// TEST WORKFLOW
// -----------------------------------------

const workflow: Workflow = {
  name: "environment-integration",

  webhook: {
    url: "/test/environment",
  },

  trigger: {
    events: ["push"],
  },

  jobs: {
    build: {
      steps: [
        {
          name: "Build",
          run: "echo environment-check",
        },
      ],
    },
  },
};

// -----------------------------------------
// HTTP SERVER
// -----------------------------------------

const app = express();

app.use(createWebhookRouter([workflow]));

const server = createServer(app);

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);

  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});

const address = server.address();

assert.ok(address && typeof address !== "string");

const base = `http://127.0.0.1:${address.port}`;
const endpoint = "/test/environment";

// -----------------------------------------
// HELPERS
// -----------------------------------------

async function startPipeline(query = ""): Promise<RunResponse> {
  const response = await fetch(base + endpoint + query);

  assert.equal(response.status, 202);

  const started = (await response.json()) as RunResponse;

  assert.ok(started.runId);
  assert.equal(started.pipelineId, workflow.name);

  return started;
}

async function waitForCompletion(runId: string): Promise<RunResponse> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const response = await fetch(`${base}${endpoint}/runs/${runId}`);

    assert.equal(response.status, 200);

    const run = (await response.json()) as RunResponse;

    if (run.status === "SUCCESS" || run.status === "FAILED") {
      return run;
    }

    await sleep(100);
  }

  throw new Error(`Pipeline timed out: ${runId}`);
}

// -----------------------------------------
// INTEGRATION TESTS
// -----------------------------------------

try {
  // TEST 1: develop -> TEST

  const testStarted = await startPipeline("?branch=develop");

  const testRun = await waitForCompletion(testStarted.runId);

  assert.equal(testRun.status, "SUCCESS");

  assert.equal(testRun.jobs?.build?.status, "SUCCESS");

  assert.equal(testRun.jobs?.build?.branch, "develop");

  assert.equal(testRun.jobs?.build?.environment, "TEST");

  console.log("Test 1 passed: develop propagates TEST");

  // TEST 2: main -> PROD

  const prodStarted = await startPipeline("?branch=main");

  const prodRun = await waitForCompletion(prodStarted.runId);

  assert.equal(prodRun.status, "SUCCESS");

  assert.equal(prodRun.jobs?.build?.branch, "main");

  assert.equal(prodRun.jobs?.build?.environment, "PROD");

  console.log("Test 2 passed: main propagates PROD");

  // TEST 3: Unsupported branch -> 400

  const invalidResponse = await fetch(
    `${base}${endpoint}?branch=feature%2Flogin`,
  );

  assert.equal(invalidResponse.status, 400);

  console.log("Test 3 passed: Unsupported branch rejected");

  // TEST 4: Empty branch -> 400

  const emptyResponse = await fetch(`${base}${endpoint}?branch=`);

  assert.equal(emptyResponse.status, 400);

  console.log("Test 4 passed: Empty branch rejected");

  // TEST 5: Repeated query parameters -> 400

  const repeatedResponse = await fetch(
    `${base}${endpoint}?branch=main&branch=develop`,
  );

  assert.equal(repeatedResponse.status, 400);

  console.log("Test 5 passed: Invalid branch parameter type rejected");

  // TEST 6: Legacy request without branch

  const legacyStarted = await startPipeline();

  const legacyRun = await waitForCompletion(legacyStarted.runId);

  assert.equal(legacyRun.status, "SUCCESS");

  assert.equal(legacyRun.jobs?.build?.status, "SUCCESS");

  assert.equal(legacyRun.jobs?.build?.branch, undefined);

  assert.equal(legacyRun.jobs?.build?.environment, undefined);

  console.log("Test 6 passed: Legacy pipeline remains compatible");

  // TEST 7: Each request creates an independent run

  assert.notEqual(testStarted.runId, prodStarted.runId);

  assert.notEqual(testStarted.runId, legacyStarted.runId);

  assert.notEqual(prodStarted.runId, legacyStarted.runId);

  console.log("Test 7 passed: Independent environment runs");

  // TEST 8: Invalid branch rejected by engine directly

  const engine = new PipelineEngine(workflow);

  await assert.rejects(() => engine.run("feature/unsafe"), /branch/i);

  await assert.rejects(() => engine.run(""), Error);

  console.log("Test 8 passed: Engine rejects unsupported branches");

  console.log("All Environment Integration tests passed!");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
