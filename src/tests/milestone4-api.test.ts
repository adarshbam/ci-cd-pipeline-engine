import assert from "node:assert/strict";
import express from "express";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";
import type { Server } from "node:http";

const testWorkflowValid: Workflow = {
  name: "test-discovery-workflow",
  webhook: {
    url: "/webhooks/test-discovery",
    methods: ["GET", "POST"],
  },
  trigger: {
    events: ["push"],
    allowedBranches: ["main"],
    allowedRepositories: ["org/repo"],
  },
  jobs: {
    build: {
      steps: [{ name: "Compile", run: "node -e \"console.log('compiling')\"" }],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Run test", run: "node -e \"console.log('testing')\"" }],
    },
  },
};

const testWorkflowInvalid: Workflow = {
  name: "test-broken-workflow",
  webhook: {
    url: "/webhooks/test-broken",
    methods: ["POST"],
  },
  trigger: {
    events: ["push"],
  },
  jobs: {
    brokenJob: {
      needs: ["non-existent-dep"],
      steps: [{ name: "Step", run: "node -e \"console.log('broken')\"" }],
    },
  },
};

const app = express();
const router = createWebhookRouter([testWorkflowValid, testWorkflowInvalid]);
app.use(router);

let server: Server | undefined;
const port = 38472;

await new Promise<void>((resolve) => {
  server = app.listen(port, () => resolve());
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. GET /api/status
  const statusRes = await fetch(`${baseUrl}/api/status`);
  assert.equal(statusRes.status, 200);
  const statusBody = (await statusRes.json()) as any;
  assert.equal(statusBody.status, "online");
  assert.equal(statusBody.totalWorkflows, 2);
  assert.ok(typeof statusBody.port === "string");

  // 2. GET /api/workflows
  const wfRes = await fetch(`${baseUrl}/api/workflows`);
  assert.equal(wfRes.status, 200);
  const workflows = (await wfRes.json()) as any[];
  assert.equal(workflows.length, 2);

  const validWf = workflows.find((w) => w.name === "test-discovery-workflow");
  assert.ok(validWf);
  assert.equal(validWf.isValid, true);
  assert.equal(validWf.jobCount, 2);
  assert.equal(validWf.validationErrors.length, 0);

  const invalidWf = workflows.find((w) => w.name === "test-broken-workflow");
  assert.ok(invalidWf);
  assert.equal(invalidWf.isValid, false);
  assert.ok(invalidWf.validationErrors.length > 0);

  // 3. GET /api/workflows/:name
  const detailRes = await fetch(`${baseUrl}/api/workflows/test-discovery-workflow`);
  assert.equal(detailRes.status, 200);
  const detailBody = (await detailRes.json()) as any;
  assert.equal(detailBody.workflow.name, "test-discovery-workflow");
  assert.equal(detailBody.isValid, true);
  assert.equal(detailBody.jobCount, 2);

  const notFoundRes = await fetch(`${baseUrl}/api/workflows/unknown-workflow`);
  assert.equal(notFoundRes.status, 404);

  // 4. POST /api/workflows/:name/run (Trigger valid workflow)
  const runRes = await fetch(`${baseUrl}/api/workflows/test-discovery-workflow/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch: "main" }),
  });
  assert.equal(runRes.status, 202);
  const runBody = (await runRes.json()) as any;
  assert.ok(runBody.runId);
  assert.equal(runBody.pipelineId, "test-discovery-workflow");

  // Trigger invalid workflow should fail with 400
  const brokenRunRes = await fetch(`${baseUrl}/api/workflows/test-broken-workflow/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch: "main" }),
  });
  assert.equal(brokenRunRes.status, 400);

  // 5. GET /api/runs (List historical executions)
  const runsRes = await fetch(`${baseUrl}/api/runs`);
  assert.equal(runsRes.status, 200);
  const runsBody = (await runsRes.json()) as any;
  assert.ok(Array.isArray(runsBody.runs));
  assert.ok(runsBody.runs.length >= 1);
  assert.ok(runsBody.memoryNotice);

  const firstRun = runsBody.runs[0];
  assert.equal(firstRun.pipelineId, "test-discovery-workflow");

  // 6. GET /api/runs/:runId
  const singleRunRes = await fetch(`${baseUrl}/api/runs/${firstRun.id}`);
  assert.equal(singleRunRes.status, 200);
  const singleBody = (await singleRunRes.json()) as any;
  assert.equal(singleBody.runId, firstRun.id);

  // 7. GET /api/metrics (Aggregate metrics)
  const metricsRes = await fetch(`${baseUrl}/api/metrics`);
  assert.equal(metricsRes.status, 200);
  const metricsBody = (await metricsRes.json()) as any;
  assert.ok(metricsBody.totalRuns >= 1);

  // 8. GET /api/integrations/status (Readiness without leaking secrets)
  const intRes = await fetch(`${baseUrl}/api/integrations/status`);
  assert.equal(intRes.status, 200);
  const intBody = (await intRes.json()) as any;
  assert.equal(intBody.backendOnline, true);
  assert.equal(intBody.loadedWorkflowsCount, 2);
  assert.ok(typeof intBody.githubTokenConfigured === "boolean");
  assert.ok(typeof intBody.githubWebhookSecretConfigured === "boolean");
  assert.ok(Array.isArray(intBody.recentDeliveries));

  const jsonStr = JSON.stringify(intBody);
  assert.ok(!jsonStr.includes("GITHUB_TOKEN="));
  assert.ok(!jsonStr.includes("replace_with_"));

  // 9. POST /api/integrations/verify-github (Safe response)
  const verifyRes = await fetch(`${baseUrl}/api/integrations/verify-github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(verifyRes.status, 200);
  const verifyBody = (await verifyRes.json()) as any;
  assert.ok(typeof verifyBody.verified === "boolean");

  console.log("All Milestone 4 Backend API tests passed successfully!");
} finally {
  server?.close();
}
