import assert from "node:assert/strict";
import express from "express";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";
import type { Server } from "node:http";

const workflow: Workflow = {
  name: "http-cancel-workflow",
  webhook: { url: "/webhook/http-cancel", methods: ["GET", "POST"] },
  trigger: { events: ["push"] },
  jobs: {
    longJob: {
      steps: [
        {
          name: "Sleep",
          run: "node -e \"setTimeout(() => {}, 6000)\"",
        },
      ],
    },
  },
};

const app = express();
const router = createWebhookRouter([workflow]);
app.use(router);

let server: Server;
const port = 38291;

await new Promise<void>((resolve) => {
  server = app.listen(port, () => resolve());
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. Start a run
  const triggerRes = await fetch(`${baseUrl}/webhook/http-cancel`);
  assert.equal(triggerRes.status, 202);
  const started = (await triggerRes.json()) as { runId: string; status: string };
  assert.ok(started.runId);

  // 2. Query run before cancel
  const queryRes = await fetch(`${baseUrl}/webhook/http-cancel/runs/${started.runId}`);
  assert.equal(queryRes.status, 200);
  const runBefore = (await queryRes.json()) as { status: string; jobs: Record<string, { status: string }> };
  assert.ok(["QUEUED", "RUNNING"].includes(runBefore.status));

  // 3. Cancel run
  const cancelRes = await fetch(`${baseUrl}/webhook/http-cancel/runs/${started.runId}/cancel`, {
    method: "POST",
  });
  assert.equal(cancelRes.status, 200);
  const cancelData = (await cancelRes.json()) as { status: string; jobs: Record<string, { status: string }> };
  assert.equal(cancelData.status, "CANCELLED");
  assert.equal(cancelData.jobs.longJob?.status, "CANCELLED");

  // 4. Query again to verify persistence
  const queryAfter = await fetch(`${baseUrl}/webhook/http-cancel/runs/${started.runId}`);
  assert.equal(queryAfter.status, 200);
  const runAfter = (await queryAfter.json()) as { status: string };
  assert.equal(runAfter.status, "CANCELLED");

  // 5. Test dashboard central API
  const statusRes = await fetch(`${baseUrl}/api/status`);
  assert.equal(statusRes.status, 200);
  const engineStatus = (await statusRes.json()) as { status: string; totalWorkflows: number };
  assert.equal(engineStatus.status, "online");
  assert.equal(engineStatus.totalWorkflows, 1);

  console.log("All HTTP Cancellation & Dashboard API tests passed!");
} finally {
  server!.close();
}
