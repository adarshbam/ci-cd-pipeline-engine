import assert from "node:assert/strict";
import express from "express";
import { createHmac } from "node:crypto";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";
import type { Server } from "node:http";

const testWorkflow: Workflow = {
  name: "security-audit-pipeline",
  webhook: {
    url: "/webhooks/security-audit",
    methods: ["POST"],
  },
  trigger: {
    events: ["push"],
    allowedBranches: ["main"],
  },
  environments: {
    test: {
      healthUrl: "http://localhost:3000/health",
      envFile: ".env.test",
    },
  },
  jobs: {
    auditJob: {
      steps: [{ name: "Echo", run: "node -e \"console.log('security audit')\"" }],
    },
  },
};

const app = express();
const router = createWebhookRouter([testWorkflow]);
app.use(router);

let server: Server | undefined;
const port = 38921;

await new Promise<void>((resolve) => {
  server = app.listen(port, () => resolve());
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. Direct Loopback Management Access (Permitted without secret in local mode)
  const localWfRes = await fetch(`${baseUrl}/api/workflows`);
  assert.equal(localWfRes.status, 200, "Direct loopback access should succeed in local mode");
  const workflows = (await localWfRes.json()) as any[];
  assert.equal(workflows.length, 1);

  // 2. Reject Public Tunnel / Reverse Proxy Header (Anti-Proxy Bypass)
  const proxyRes = await fetch(`${baseUrl}/api/workflows`, {
    headers: {
      "X-Forwarded-For": "198.51.100.24",
    },
  });
  assert.equal(
    proxyRes.status,
    403,
    "Requests with X-Forwarded-For should be rejected when MANAGEMENT_SECRET is not configured",
  );

  const tunnelHostRes = await fetch(`${baseUrl}/api/workflows`, {
    headers: {
      "X-Forwarded-Host": "evil-tunnel.ngrok-free.dev",
    },
  });
  assert.equal(
    tunnelHostRes.status,
    403,
    "Requests bearing public tunnel host headers should be rejected",
  );

  // 3. CSRF Protection for State-Changing Management Actions
  const csrfRes = await fetch(`${baseUrl}/api/workflows/security-audit-pipeline/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil-attacker.site",
    },
    body: JSON.stringify({ branch: "main" }),
  });
  assert.equal(csrfRes.status, 403, "Cross-site origin requests to mutate pipeline must be rejected");

  // Valid local origin succeeds
  const validOriginRes = await fetch(`${baseUrl}/api/workflows/security-audit-pipeline/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({ branch: "main" }),
  });
  assert.equal(validOriginRes.status, 202, "Valid local origin request must be accepted");
  const runData = (await validOriginRes.json()) as any;
  assert.ok(runData.runId);

  // 4. Path Traversal Guard on Workflow and Run ID Endpoints
  const pathTraversalWf = await fetch(`${baseUrl}/api/workflows/..%2F..%2Fetc%2Fpasswd`);
  assert.ok(
    [400, 404].includes(pathTraversalWf.status),
    "Path traversal in workflow name must be rejected",
  );

  const pathTraversalRun = await fetch(`${baseUrl}/api/runs/..%2F..%2Fetc%2Fpasswd/logs`);
  assert.ok(
    [400, 404].includes(pathTraversalRun.status),
    "Path traversal in runId logs must be rejected",
  );

  const pathTraversalJob = await fetch(`${baseUrl}/api/runs/${runData.runId}/logs?jobId=..%2Fmalicious`);
  assert.equal(pathTraversalJob.status, 400, "Path traversal in jobId must return 400");

  // 5. Zero Secret Disclosure
  const integrationsRes = await fetch(`${baseUrl}/api/integrations/status`);
  assert.equal(integrationsRes.status, 200);
  const integBody = (await integrationsRes.json()) as any;
  assert.ok(typeof integBody.githubTokenConfigured === "boolean");
  assert.equal(integBody.GITHUB_TOKEN, undefined, "Raw token must never be present");
  assert.equal(integBody.GITHUB_WEBHOOK_SECRET, undefined, "Raw webhook secret must never be present");

  const wfDetailRes = await fetch(`${baseUrl}/api/workflows/security-audit-pipeline`);
  assert.equal(wfDetailRes.status, 200);
  const wfDetail = (await wfDetailRes.json()) as any;
  assert.equal(wfDetail.workflow.environments.test.envFile, undefined, "Raw envFile path should not be disclosed");
  assert.equal(wfDetail.workflow.environments.test.envConfigured, true);

  // 6. MANAGEMENT_SECRET Enforcement Mode
  process.env.MANAGEMENT_SECRET = "super-secret-passphrase-999";
  try {
    // Request without token should now fail with 401
    const noTokenRes = await fetch(`${baseUrl}/api/workflows`);
    assert.equal(noTokenRes.status, 401, "Requests without token must fail when MANAGEMENT_SECRET is set");

    // Request with invalid token should fail with 401
    const badTokenRes = await fetch(`${baseUrl}/api/workflows`, {
      headers: { "x-management-token": "wrong-token" },
    });
    assert.equal(badTokenRes.status, 401, "Requests with invalid token must fail");

    // Request with valid token succeeds
    const goodTokenRes = await fetch(`${baseUrl}/api/workflows`, {
      headers: { "x-management-token": "super-secret-passphrase-999" },
    });
    assert.equal(goodTokenRes.status, 200, "Requests with valid x-management-token must succeed");
  } finally {
    delete process.env.MANAGEMENT_SECRET;
  }

  // 7. Webhook HMAC-SHA256 Signature Verification
  process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret-key";
  try {
    const rawPayload = JSON.stringify({
      ref: "refs/heads/main",
      repository: { full_name: "test/repo" },
      after: "1111111111111111111111111111111111111111",
      commits: [{ id: "c123", message: "test commit" }],
    });

    // A. Missing signature -> 401
    const noSigRes = await fetch(`${baseUrl}/webhooks/security-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": "del-001",
      },
      body: rawPayload,
    });
    assert.equal(noSigRes.status, 401, "Webhook without signature must return 401");

    // B. Invalid signature -> 401
    const badSigRes = await fetch(`${baseUrl}/webhooks/security-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": "del-002",
        "X-Hub-Signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      },
      body: rawPayload,
    });
    assert.equal(badSigRes.status, 401, "Webhook with invalid signature must return 401");

    // C. Valid signature -> 200 or 202
    const hmac = createHmac("sha256", "test-webhook-secret-key");
    hmac.update(rawPayload);
    const validSig = `sha256=${hmac.digest("hex")}`;

    const goodSigRes = await fetch(`${baseUrl}/webhooks/security-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": "del-003",
        "X-Hub-Signature-256": validSig,
      },
      body: rawPayload,
    });
    assert.ok(
      [200, 202].includes(goodSigRes.status),
      `Webhook with valid HMAC signature must be accepted (got ${goodSigRes.status})`,
    );
  } finally {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  }

  console.log("All Milestone 5 Security Regression tests passed successfully!");
} finally {
  server?.close();
}
