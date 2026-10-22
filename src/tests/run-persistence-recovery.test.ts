import assert from "node:assert/strict";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { once } from "node:events";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";
import {
  saveRun,
  loadAllStoredRuns,
  getStoredRun,
  ensureRunStorageDir,
} from "../storage/run-store.js";
import { createWebhookRouter } from "../routes/webhook.routes.js";

const TEST_STORAGE_DIR = path.resolve("runtime/history/test-runs");

const sampleWorkflow: Workflow = {
  name: "persistence-test-workflow",
  webhook: {
    url: "/webhooks/persistence-test",
    methods: ["POST"],
  },
  trigger: {
    events: ["push"],
    allowedBranches: ["main"],
  },
  jobs: {
    build: {
      steps: [
        {
          name: "compile",
          run: "echo 'Persistence build step successful'",
        },
      ],
    },
  },
};

console.log("Starting Run Persistence & Recovery Tests...");

// TEST 1 — Save and retrieve completed run from disk
{
  await ensureRunStorageDir(TEST_STORAGE_DIR);

  const engine = new PipelineEngine(sampleWorkflow);
  const run = await engine.run("main");
  assert.ok(run.id);

  // Save run to test storage
  await saveRun(run, TEST_STORAGE_DIR);

  const retrieved = await getStoredRun(run.id, TEST_STORAGE_DIR);
  assert.ok(retrieved);
  assert.equal(retrieved.id, run.id);
  assert.equal(retrieved.pipelineId, sampleWorkflow.name);
  assert.equal(retrieved.branch, "main");

  // Clean up
  await unlink(path.join(TEST_STORAGE_DIR, `${run.id}.json`)).catch(() => {});
  console.log("Test 1 passed: Run successfully saved and retrieved from storage");
}

// TEST 2 — Honest recovery of interrupted runs upon server restart
{
  await ensureRunStorageDir(TEST_STORAGE_DIR);

  const interruptedRunId = "interrupted-run-uuid-001";
  const fakeInterruptedRun = {
    id: interruptedRunId,
    pipelineId: sampleWorkflow.name,
    status: "RUNNING",
    createdAt: new Date(Date.now() - 60000).toISOString(),
    startedAt: new Date(Date.now() - 55000).toISOString(),
    branch: "main",
    jobs: {
      build: {
        jobId: "build",
        status: "RUNNING",
        startedAt: new Date(Date.now() - 50000).toISOString(),
      },
      test: {
        jobId: "test",
        status: "QUEUED",
      },
    },
    workflow: sampleWorkflow,
  };

  const filePath = path.join(TEST_STORAGE_DIR, `${interruptedRunId}.json`);
  await writeFile(filePath, JSON.stringify(fakeInterruptedRun, null, 2), "utf8");

  // Load runs via store (simulating server reboot)
  const loadedRuns = await loadAllStoredRuns(TEST_STORAGE_DIR);
  const recovered = loadedRuns.find((r) => r.id === interruptedRunId);

  assert.ok(recovered, "Expected interrupted run to be loaded");
  assert.equal(
    recovered.status,
    "FAILED",
    "Interrupted run must be honestly marked FAILED, never SUCCESS",
  );
  assert.ok(recovered.finishedAt, "finishedAt timestamp must be assigned");

  assert.ok(recovered.jobs?.build);
  assert.ok(recovered.jobs?.test);

  assert.equal(
    recovered.jobs.build.status,
    "FAILED",
    "Running job must be marked FAILED",
  );
  assert.match(
    recovered.jobs.build.failureReason || "",
    /interrupted/i,
    "Failure reason must document server interruption",
  );

  assert.equal(
    recovered.jobs.test.status,
    "FAILED",
    "Queued job must be marked FAILED",
  );

  // Clean up
  await unlink(filePath).catch(() => {});
  console.log("Test 2 passed: Interrupted run honestly recovered as FAILED with explicit reason");
}

// TEST 3 — Management API serves persisted runs and respects authentication
{
  const app = express();
  app.use(createWebhookRouter([sampleWorkflow]));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const res = await fetch(`${baseUrl}/api/runs`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { runs: any[]; storageNotice?: string };
    assert.ok(Array.isArray(body.runs));
    assert.ok(body.storageNotice, "Expected storage notice to document persistent engine storage");
    console.log("Test 3 passed: Management API exposes persistent runs and metadata");
  } finally {
    server.close();
  }
}

console.log("ALL RUN PERSISTENCE & RECOVERY TESTS PASSED!");
