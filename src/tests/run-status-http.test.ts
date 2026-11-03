import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { loadWorkflows } from "../workflow/workflow-loader.js";
import { createWebhookRouter } from "../routes/webhook.routes.js";

let endpoint = "http://localhost:3000/github/ci-cd";
let ephemeralServer: Server | undefined;

try {
  const probe = await fetch(`${endpoint}/runs/nonexistent-run-id`, {
    signal: AbortSignal.timeout(1000),
  }).catch(() => null);

  if (!probe) {
    const app = express();
    const workflows = await loadWorkflows();
    app.use(createWebhookRouter(workflows));
    await new Promise<void>((resolve) => {
      ephemeralServer = app.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = ephemeralServer!.address();
    if (addr && typeof addr === "object") {
      endpoint = `http://127.0.0.1:${addr.port}/github/ci-cd`;
    }
  }

  // Test 1: Unknown run returns 404
  const missingResponse = await fetch(`${endpoint}/runs/nonexistent-run-id`);

  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    error: "Run not found",
  });

  console.log("Test 1 passed: Unknown run returns 404");

  // Test 2: Create a real pipeline run
  const startResponse = await fetch(endpoint);

  assert.equal(startResponse.status, 202);

  const started = (await startResponse.json()) as {
    runId: string;
  };

  assert.ok(started.runId);

  // Test 3: Existing run returns 200
  const statusResponse = await fetch(`${endpoint}/runs/${started.runId}`);

  assert.equal(statusResponse.status, 200);

  const run = (await statusResponse.json()) as {
    runId: string;
    pipelineId: string;
    status: string;
  };

  assert.equal(run.runId, started.runId);
  assert.ok(run.pipelineId);
  assert.ok(run.status);

  console.log("Test 2 passed: Valid run returns 200");
  console.log("All HTTP status tests passed!");
} finally {
  if (ephemeralServer) {
    ephemeralServer.closeAllConnections();
    await new Promise<void>((resolve) => ephemeralServer!.close(() => resolve()));
  }
}
