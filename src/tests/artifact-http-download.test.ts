import assert from "node:assert/strict";
import express from "express";
import { createWebhookRouter } from "../routes/webhook.routes.js";
import type { Workflow } from "../workflow/workflow.js";
import type { Server } from "node:http";
import { saveArtifact } from "../artifacts/artifact-manager.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const testWorkflow: Workflow = {
  name: "artifact-test-workflow",
  webhook: {
    url: "/webhooks/artifact-test",
    methods: ["GET", "POST"],
  },
  trigger: {
    events: ["push"],
  },
  jobs: {
    build: {
      steps: [{ name: "Compile", run: "node -e \"console.log('compiling')\"" }],
    },
  },
};

const app = express();
const router = createWebhookRouter([testWorkflow]);
app.use(router);

let server: Server | undefined;
let baseUrl = "";

async function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server?.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) return resolve();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function runTests() {
  await startServer();

  try {
    const testRunId = "run-art-test-001";
    const testJobId = "build";
    const testArtName = "sample-report.txt";
    const testArtContent = "CI/CD Test Artifact Content Line 1\nLine 2";

    // Setup real file in temp and save as artifact
    const tmpDir = path.join(os.tmpdir(), `cicd-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const srcFile = path.join(tmpDir, "sample.txt");
    await writeFile(srcFile, testArtContent, "utf8");

    try {
      await saveArtifact(testRunId, testJobId, testArtName, srcFile);
    } catch (e: any) {
      if (!e?.message?.includes("already exists")) throw e;
    }

    // Test 1: List Run Artifacts
    console.log("Test 1: GET /api/runs/:runId/artifacts");
    const listRes = await fetch(`${baseUrl}/api/runs/${testRunId}/artifacts`);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.runId, testRunId);
    assert.ok(Array.isArray(listData.artifacts));
    const found = listData.artifacts.find((a: any) => a.name === testArtName);
    assert.ok(found, "Artifact must be listed");
    assert.equal(found.jobId, testJobId);
    console.log("✓ Test 1 passed: List run artifacts works");

    // Test 2: Download artifact via full path
    console.log("Test 2: GET /api/runs/:runId/artifacts/:jobId/:artifactName/download");
    const dlRes = await fetch(`${baseUrl}/api/runs/${testRunId}/artifacts/${testJobId}/${testArtName}/download`);
    assert.equal(dlRes.status, 200);
    assert.equal(dlRes.headers.get("content-disposition"), `attachment; filename="${testArtName}"`);
    const dlText = await dlRes.text();
    assert.equal(dlText, testArtContent, "Downloaded content must match exactly");
    console.log("✓ Test 2 passed: Full download endpoint works with content integrity");

    // Test 3: Download artifact via shortcut
    console.log("Test 3: GET /api/runs/:runId/artifacts/:artifactName/download shortcut");
    const shortRes = await fetch(`${baseUrl}/api/runs/${testRunId}/artifacts/${testArtName}/download`);
    assert.equal(shortRes.status, 200);
    const shortText = await shortRes.text();
    assert.equal(shortText, testArtContent);
    console.log("✓ Test 3 passed: Shortcut download endpoint works");

    // Test 4: Missing artifact 404
    console.log("Test 4: Non-existent artifact returns 404");
    const missingRes = await fetch(`${baseUrl}/api/runs/${testRunId}/artifacts/${testJobId}/non-existent.tar.gz/download`);
    assert.equal(missingRes.status, 404);
    const missingData = await missingRes.json();
    assert.equal(missingData.error, "Artifact not found");
    console.log("✓ Test 4 passed: Missing artifact produces clear 404 error");

    // Test 5: Path traversal rejection
    console.log("Test 5: Path traversal rejection");
    const travRes = await fetch(`${baseUrl}/api/runs/${testRunId}/artifacts/..%2F..%2Fetc/shadow/download`);
    assert.ok(travRes.status === 400 || travRes.status === 404);
    console.log("✓ Test 5 passed: Traversal attempt blocked");

    // Test 6: Global artifacts listing
    console.log("Test 6: GET /api/artifacts");
    const globalRes = await fetch(`${baseUrl}/api/artifacts`);
    assert.equal(globalRes.status, 200);
    const globalData = await globalRes.json();
    assert.ok(Array.isArray(globalData.artifacts));
    assert.ok(globalData.artifacts.length > 0);
    console.log("✓ Test 6 passed: Global artifacts listing works");

    console.log("ALL ARTIFACT HTTP & DOWNLOAD TESTS PASSED!");
  } finally {
    await stopServer();
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
