import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { loadWorkflows } from "../workflow/workflow-loader.js";
import {
  createWebhookRouter,
  validateWorkflow,
} from "../routes/webhook.routes.js";
import { saveArtifact } from "../artifacts/artifact-manager.js";
import type { Workflow } from "../workflow/workflow.js";

console.log("=== Starting QE Smoke & Fuzzing Test Suite ===");

// ---------------------------------------------------------------------------
// 1. Validate all 14 workflow JSON files + test enhanced validateWorkflow rules
// ---------------------------------------------------------------------------
const workflows = await loadWorkflows();
assert.ok(workflows.length >= 14, `Expected >= 14 workflows, got ${workflows.length}`);

for (const wf of workflows) {
  const result = validateWorkflow(wf);
  if (wf.name === "broken-cycle") {
    assert.equal(result.isValid, false, "broken-cycle must be flagged invalid");
    assert.ok(
      result.errors.some((e) => e.includes("Circular dependency")),
      "broken-cycle must report circular dependency",
    );
  } else {
    assert.equal(
      result.isValid,
      true,
      `Workflow '${wf.name}' failed validation: ${result.errors.join("; ")}`,
    );
  }
}
console.log("✓ Test 1 passed: All 13 valid workflows pass validation and broken-cycle is flagged");

// Test enhanced validateWorkflow edge cases
{
  const missingStepCmd: Workflow = {
    name: "bad-step-wf",
    webhook: { url: "/webhooks/bad-step" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Empty step" } as any],
      },
    },
  };
  const res1 = validateWorkflow(missingStepCmd);
  assert.equal(res1.isValid, false);
  assert.ok(res1.errors.some((e) => e.includes("must specify either 'run' or 'script'")));

  const missingArtifactFromJob: Workflow = {
    name: "bad-artifact-wf",
    webhook: { url: "/webhooks/bad-artifact" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "echo ok" }],
      },
      deploy: {
        needs: ["build"],
        artifacts: {
          download: [{ name: "bundle", path: "./dist" } as any],
        },
        steps: [{ name: "Deploy", run: "echo deploy" }],
      },
    },
  };
  const res2 = validateWorkflow(missingArtifactFromJob);
  assert.equal(res2.isValid, false);
  assert.ok(res2.errors.some((e) => e.includes("fromJob")));

  const artifactFromJobNotInNeeds: Workflow = {
    name: "bad-artifact-needs-wf",
    webhook: { url: "/webhooks/bad-artifact-needs" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "echo ok" }],
      },
      deploy: {
        artifacts: {
          download: [{ name: "bundle", fromJob: "build", path: "./dist" }],
        },
        steps: [{ name: "Deploy", run: "echo deploy" }],
      },
    },
  };
  const res3 = validateWorkflow(artifactFromJobNotInNeeds);
  assert.equal(res3.isValid, false);
  assert.ok(res3.errors.some((e) => e.includes("does not list 'build' in 'needs'")));
}
console.log("✓ Test 2 passed: Enhanced validateWorkflow catches malformed steps and artifact dependencies");

// ---------------------------------------------------------------------------
// 2. Start Express server with all loaded workflows for live API fuzzing
// ---------------------------------------------------------------------------
const app = express();
app.use(createWebhookRouter(workflows));

let server: Server | undefined;
await new Promise<void>((resolve) => {
  server = app.listen(0, "127.0.0.1", () => resolve());
});
const addr = server!.address();
assert.ok(addr && typeof addr === "object");
const baseUrl = `http://127.0.0.1:${addr.port}`;

try {
  // -------------------------------------------------------------------------
  // 3. Fuzz POST /api/workflows/:name/run with invalid branches & payloads
  // -------------------------------------------------------------------------
  for (const invalidBranch of ["feature/login", "staging", "Main", "master", "", "   "]) {
    const res = await fetch(`${baseUrl}/api/workflows/day7-capstone/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch: invalidBranch }),
    });
    assert.equal(
      res.status,
      400,
      `Expected 400 for invalid branch ${JSON.stringify(invalidBranch)}, got ${res.status}`,
    );
    const body = (await res.json()) as { error?: string };
    assert.ok(body.error, "400 response must include error message");
  }

  // Non-string branch type
  const nonStringBranchRes = await fetch(`${baseUrl}/api/workflows/day7-capstone/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch: ["main", "develop"] }),
  });
  assert.equal(nonStringBranchRes.status, 400);
  console.log("✓ Test 3 passed: POST /api/workflows/:name/run rejects invalid branches with 400 (never 500)");

  // -------------------------------------------------------------------------
  // 4. Execute fixed vault-storage-cicd (project-1.json) end-to-end on 'develop'
  // -------------------------------------------------------------------------
  const runTriggerRes = await fetch(`${baseUrl}/api/workflows/vault-storage-cicd/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch: "develop" }),
  });
  assert.equal(runTriggerRes.status, 202);
  const triggered = (await runTriggerRes.json()) as {
    runId: string;
    branch: string;
    environment: string;
  };
  assert.equal(triggered.branch, "develop");
  assert.equal(triggered.environment, "TEST");

  // Poll until completion
  let completedRun: any;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const r = await fetch(`${baseUrl}/api/runs/${triggered.runId}`);
    assert.equal(r.status, 200);
    const data = (await r.json()) as any;
    if (data.status === "SUCCESS" || data.status === "FAILED") {
      completedRun = data;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(completedRun, "vault-storage-cicd run should complete in time");
  assert.equal(
    completedRun.status,
    "SUCCESS",
    `vault-storage-cicd failed: ${completedRun.failureReason}`,
  );
  for (const jobName of ["test", "lint", "build", "deploy"]) {
    assert.equal(
      completedRun.jobs[jobName]?.status,
      "SUCCESS",
      `Job ${jobName} did not succeed`,
    );
  }
  console.log("✓ Test 4 passed: vault-storage-cicd executes all 4 DAG jobs + artifact transfer to SUCCESS");

  // -------------------------------------------------------------------------
  // 5. Verify cancelling an ALREADY completed run does NOT corrupt its status
  // -------------------------------------------------------------------------
  const cancelCompletedRes = await fetch(
    `${baseUrl}/api/runs/${triggered.runId}/cancel`,
    { method: "POST" },
  );
  assert.equal(cancelCompletedRes.status, 200);
  const cancelCompletedBody = (await cancelCompletedRes.json()) as {
    status: string;
    cancelled: boolean;
  };
  assert.equal(
    cancelCompletedBody.cancelled,
    false,
    "Cancelling an already finished run must return cancelled: false",
  );
  assert.equal(
    cancelCompletedBody.status,
    "SUCCESS",
    "Completed run status must remain SUCCESS after cancel attempt",
  );
  console.log("✓ Test 5 passed: Cancelling an already-completed run preserves its final status");

  // -------------------------------------------------------------------------
  // 6. Test single-file directory and multi-file directory artifact downloads
  // -------------------------------------------------------------------------
  const tmpRoot = path.join(os.tmpdir(), `qe-artifact-test-${Date.now()}`);
  const singleDir = path.join(tmpRoot, "single-dir");
  const multiDir = path.join(tmpRoot, "multi-dir");
  await mkdir(singleDir, { recursive: true });
  await mkdir(path.join(multiDir, "nested"), { recursive: true });

  await writeFile(path.join(singleDir, "bundle.js"), "console.log('single-dir-ok');", "utf8");
  await writeFile(path.join(multiDir, "index.html"), "<html>ok</html>", "utf8");
  await writeFile(path.join(multiDir, "nested", "app.css"), "body { color: #111; }", "utf8");

  const testRunId = triggered.runId;
  await saveArtifact(testRunId, "build", "single-dir-art", singleDir);
  await saveArtifact(testRunId, "build", "multi-dir-art", multiDir);

  // Download single-file directory via both full path and shortcut
  const dlSingle1 = await fetch(
    `${baseUrl}/api/runs/${testRunId}/artifacts/build/single-dir-art/download`,
  );
  assert.equal(dlSingle1.status, 200);
  assert.equal(await dlSingle1.text(), "console.log('single-dir-ok');");

  const dlSingle2 = await fetch(
    `${baseUrl}/api/runs/${testRunId}/artifacts/single-dir-art/download`,
  );
  assert.equal(dlSingle2.status, 200);
  assert.equal(await dlSingle2.text(), "console.log('single-dir-art');".replace("single-dir-art", "single-dir-ok"));

  // Download multi-file directory via both full path and shortcut
  const dlMulti1 = await fetch(
    `${baseUrl}/api/runs/${testRunId}/artifacts/build/multi-dir-art/download`,
  );
  assert.equal(dlMulti1.status, 200);
  const multiBundle1 = JSON.parse(await dlMulti1.text());
  assert.equal(multiBundle1.type, "directory-bundle");
  assert.equal(multiBundle1.fileCount, 2);
  assert.equal(multiBundle1.files["index.html"], "<html>ok</html>");
  assert.equal(multiBundle1.files["nested/app.css"], "body { color: #111; }");

  const dlMulti2 = await fetch(
    `${baseUrl}/api/runs/${testRunId}/artifacts/multi-dir-art/download`,
  );
  assert.equal(dlMulti2.status, 200);
  const multiBundle2 = JSON.parse(await dlMulti2.text());
  assert.equal(multiBundle2.fileCount, 2);

  await rm(tmpRoot, { recursive: true, force: true });
  console.log("✓ Test 6 passed: Single-file and multi-file directory artifacts download cleanly");

  // -------------------------------------------------------------------------
  // 7. Fuzz query parameters, pagination, and injection strings
  // -------------------------------------------------------------------------
  const fuzzUrls = [
    `${baseUrl}/api/runs?limit=0&offset=-10`,
    `${baseUrl}/api/runs?limit=999999&offset=NaN`,
    `${baseUrl}/api/runs?workflow=%3Cscript%3Ealert(1)%3C%2Fscript%3E&status=INVALID`,
    `${baseUrl}/api/runs/${testRunId}/logs?limit=-1&offset=-5`,
  ];
  for (const url of fuzzUrls) {
    const res = await fetch(url);
    assert.equal(res.status, 200, `Fuzz URL ${url} should return 200, got ${res.status}`);
  }

  const badLogLevelRes = await fetch(`${baseUrl}/api/runs/${testRunId}/logs?level=TRACE`);
  assert.equal(badLogLevelRes.status, 400);

  const badJobIdRes = await fetch(`${baseUrl}/api/runs/${testRunId}/logs?jobId=build;whoami`);
  assert.equal(badJobIdRes.status, 400);

  // Verify /api/environments reflects accurate targetBranch and status
  const envsRes = await fetch(`${baseUrl}/api/environments`);
  assert.equal(envsRes.status, 200);
  const envs = (await envsRes.json()) as any[];
  const testEnv = envs.find((e) => e.id === "env-test");
  assert.ok(testEnv);
  assert.equal(testEnv.targetBranch, "develop");
  assert.equal(testEnv.status, "healthy");

  console.log("✓ Test 7 passed: Pagination fuzzing, injection guards, and /api/environments verified");
  console.log("=== ALL QE SMOKE & FUZZING TESTS PASSED! ===");
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
}
