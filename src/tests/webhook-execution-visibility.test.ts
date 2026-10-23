import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import express from "express";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";

const SECRET = "visibility-secret-123";
process.env.GITHUB_WEBHOOK_SECRET = SECRET;
delete process.env.GITHUB_TOKEN; // Test with unavailable token first

function sign(payload: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(payload).digest("hex");
}

async function main() {
  console.log("Starting Webhook Execution Visibility Integration Test...");

  const testWorkflow: Workflow = {
    name: "visibility-workflow",
    webhook: {
      url: "/github/ci-cd",
      methods: ["GET", "POST"],
    },
    trigger: {
      events: ["push"],
      allowedBranches: ["main"],
      allowedRepositories: ["org/repo-vis"],
    },
    jobs: {
      test: {
        steps: [
          {
            name: "Run test step",
            run: "node -e \"console.log('visibility-test-passed')\"",
          },
        ],
      },
    },
  };

  const app = express();
  const router = createWebhookRouter([testWorkflow]);
  app.use(router);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Send an accepted push delivery
    const deliveryId1 = "del-accepted-001";
    const acceptedPayload = JSON.stringify({
      ref: "refs/heads/main",
      after: "111122223333444455556666777788889999aaaa",
      repository: {
        full_name: "org/repo-vis",
      },
      pusher: {
        name: "test-dev",
      },
    });

    const res1 = await fetch(`${baseUrl}/github/ci-cd`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-github-delivery": deliveryId1,
        "x-hub-signature-256": sign(acceptedPayload),
      },
      body: acceptedPayload,
    });
    assert.equal(res1.status, 200, "Push delivery should be accepted with 200");

    // 2. Send a branch mismatch push delivery (branch: feature-x)
    const deliveryId2 = "del-branch-mismatch-002";
    const branchMismatchPayload = JSON.stringify({
      ref: "refs/heads/feature-x",
      after: "bbbb22223333444455556666777788889999aaaa",
      repository: {
        full_name: "org/repo-vis",
      },
    });

    const res2 = await fetch(`${baseUrl}/github/ci-cd`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-github-delivery": deliveryId2,
        "x-hub-signature-256": sign(branchMismatchPayload),
      },
      body: branchMismatchPayload,
    });
    assert.equal(res2.status, 200, "Skipped delivery is acknowledged with 200");

    // 3. Send a repository mismatch push delivery (repo: unauthorized/repo)
    const deliveryId3 = "del-repo-mismatch-003";
    const repoMismatchPayload = JSON.stringify({
      ref: "refs/heads/main",
      after: "cccc22223333444455556666777788889999aaaa",
      repository: {
        full_name: "unauthorized/repo",
      },
    });

    const res3 = await fetch(`${baseUrl}/github/ci-cd`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-github-delivery": deliveryId3,
        "x-hub-signature-256": sign(repoMismatchPayload),
      },
      body: repoMismatchPayload,
    });
    assert.equal(res3.status, 200, "Rejected delivery is acknowledged with 200");

    // 4. Send a duplicate delivery of deliveryId1
    const res4 = await fetch(`${baseUrl}/github/ci-cd`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-github-delivery": deliveryId1,
        "x-hub-signature-256": sign(acceptedPayload),
      },
      body: acceptedPayload,
    });
    assert.equal(res4.status, 200, "Duplicate delivery acknowledged with 200");

    // Wait 500ms for async scheduler completion
    await new Promise((r) => setTimeout(r, 600));

    // 5. Query /api/webhooks/deliveries
    const deliveriesRes = await fetch(`${baseUrl}/api/webhooks/deliveries`);
    assert.equal(deliveriesRes.status, 200);
    const deliveriesData: any = await deliveriesRes.json();
    assert.equal(deliveriesData.total, 4, "Should have 4 recorded deliveries");

    const [dupDel, repoDel, branchDel, acceptedDel] = deliveriesData.deliveries;

    // Check duplicate delivery
    assert.equal(dupDel.id, deliveryId1);
    assert.equal(dupDel.status, "skipped");
    assert.equal(dupDel.validationOutcome, "Duplicate Ignored");
    assert.match(dupDel.outcomeReason, /already processed/);

    // Check repo mismatch delivery
    assert.equal(repoDel.id, deliveryId3);
    assert.equal(repoDel.status, "rejected");
    assert.equal(repoDel.validationOutcome, "Rejected");
    assert.match(repoDel.outcomeReason, /allowedRepositories/);

    // Check branch mismatch delivery
    assert.equal(branchDel.id, deliveryId2);
    assert.equal(branchDel.status, "skipped");
    assert.equal(branchDel.validationOutcome, "Ignored / Skipped");
    assert.match(branchDel.outcomeReason, /allowedBranches/);

    // Check accepted delivery
    assert.equal(acceptedDel.id, deliveryId1);
    assert.equal(acceptedDel.status, "accepted");
    assert.equal(acceptedDel.validationOutcome, "Accepted & Triggered");
    assert.ok(acceptedDel.runId, "Accepted delivery must link to runId");
    assert.equal(acceptedDel.commitStatus.context, "custom-ci/pipeline");
    assert.equal(acceptedDel.commitStatus.state, "unavailable", "Token unset -> unavailable");
    assert.ok(acceptedDel.commitStatus.url.includes("111122223333444455556666777788889999aaaa"));

    console.log("Step 1 passed: All webhook delivery outcomes, reasons, and linkages verified.");

    // 6. Query /api/runs/:runId
    const runRes = await fetch(`${baseUrl}/api/runs/${acceptedDel.runId}`);
    assert.equal(runRes.status, 200);
    const runData: any = await runRes.json();
    assert.equal(runData.runId, acceptedDel.runId);
    assert.equal(runData.commitSha, "111122223333444455556666777788889999aaaa");
    assert.equal(runData.repository, "org/repo-vis");
    assert.equal(runData.deliveryId, deliveryId1);
    assert.equal(runData.status, "SUCCESS");
    assert.equal(runData.jobs.test.status, "SUCCESS");

    console.log("Step 2 passed: Pipeline run execution matches delivery and final status is SUCCESS.");

    // 7. Query /api/events
    const eventsRes = await fetch(`${baseUrl}/api/events`);
    assert.equal(eventsRes.status, 200);
    const events: any[] = await eventsRes.json();
    assert.ok(events.length > 0, "Events must contain real events");
    const webhookEvents = events.filter((e) => e.type === "webhook");
    const systemEvents = events.filter((e) => e.type === "system");
    assert.ok(webhookEvents.length >= 4, "Must contain webhook events");
    assert.ok(systemEvents.length >= 1, "Must contain system run events");

    console.log("Step 3 passed: Real events stream returned genuine webhook and run events.");

    // 8. Query /api/environments
    const envsRes = await fetch(`${baseUrl}/api/environments`);
    assert.equal(envsRes.status, 200);
    const envs: any[] = await envsRes.json();
    assert.equal(envs.length, 2);
    assert.equal(envs[0].name, "Production");
    assert.equal(envs[1].name, "Staging / Preview");

    console.log("Step 4 passed: Declarative environments endpoint verified.");

    // 9. Test with GITHUB_TOKEN configured to verify pending -> success status transition
    const mockGithubReports: any[] = [];
    const mockGithubServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      mockGithubReports.push({ url: req.url, body });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ state: body.state, context: body.context }));
    });
    await new Promise<void>((r) => mockGithubServer.listen(0, r));
    const githubPort = (mockGithubServer.address() as any).port;

    process.env.GITHUB_TOKEN = "test-live-github-token-999";
    process.env.GITHUB_API_BASE_URL = `http://127.0.0.1:${githubPort}`;

    const deliveryId5 = "del-with-github-token-005";
    const tokenPayload = JSON.stringify({
      ref: "refs/heads/main",
      after: "999922223333444455556666777788889999aaaa",
      repository: { full_name: "org/repo-vis" },
    });

    const res5 = await fetch(`${baseUrl}/github/ci-cd`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-github-delivery": deliveryId5,
        "x-hub-signature-256": sign(tokenPayload),
      },
      body: tokenPayload,
    });
    assert.equal(res5.status, 200);

    // Wait for pipeline and GitHub reporting completion
    await new Promise((r) => setTimeout(r, 600));

    // Verify mock GitHub received status calls
    assert.ok(mockGithubReports.length >= 2, "GitHub server must receive pending and success calls");
    assert.equal(mockGithubReports[0].body.state, "pending");
    assert.equal(mockGithubReports[0].body.context, "custom-ci/pipeline");
    assert.equal(mockGithubReports[1].body.state, "success");
    assert.equal(mockGithubReports[1].body.context, "custom-ci/pipeline");

    // Verify /api/webhooks/deliveries has commitStatus.state === 'success'
    const deliveriesRes2 = await fetch(`${baseUrl}/api/webhooks/deliveries`);
    const deliveriesData2: any = await deliveriesRes2.json();
    const tokenDel = deliveriesData2.deliveries.find((d: any) => d.id === deliveryId5);
    assert.ok(tokenDel, "Delivery must exist");
    assert.equal(tokenDel.commitStatus.state, "success");
    assert.equal(tokenDel.commitStatus.context, "custom-ci/pipeline");
    assert.ok(tokenDel.commitStatus.url.includes("999922223333444455556666777788889999aaaa"));

    mockGithubServer.close();
    console.log("Step 5 passed: GitHub commit status reporting transitions to success with live token.");

    console.log("ALL WEBHOOK EXECUTION VISIBILITY TESTS PASSED SUCCESSFULLY!");
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
