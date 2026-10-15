import assert from "node:assert/strict";
import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

import {
  getArtifactPath,
  initializeArtifactStorage,
} from "../artifacts/artifact-manager.js";

// ========================================
// WORKFLOW 1: SUCCESSFUL ARTIFACT TRANSFER
// ========================================

const successWorkflow: Workflow = {
  name: "artifact-success",
  webhook: {
    url: "/test/artifact-success",
  },
  trigger: {
    events: ["push"],
  },

  jobs: {
    build: {
      steps: [
        {
          name: "Generate build",
          run: [
            "mkdir -p dist/assets",
            "echo hello-from-build > dist/index.txt",
            "echo asset-ready > dist/assets/app.txt",
          ].join(" && "),
        },
      ],

      artifacts: {
        upload: [
          {
            name: "frontend",
            path: "dist",
          },
        ],
      },
    },

    deploy: {
      needs: ["build"],

      artifacts: {
        download: [
          {
            fromJob: "build",
            name: "frontend",
            path: "dist",
          },
        ],
      },

      steps: [
        {
          name: "Verify downloaded build",
          run: [
            'test "$(cat dist/index.txt)" = "hello-from-build"',
            'test "$(cat dist/assets/app.txt)" = "asset-ready"',
          ].join(" && "),
        },
      ],
    },
  },
};

// ========================================
// WORKFLOW 2: BUILD FAILURE
// ========================================

const failureWorkflow: Workflow = {
  name: "artifact-failure",
  webhook: {
    url: "/test/artifact-failure",
  },
  trigger: {
    events: ["push"],
  },

  jobs: {
    build: {
      steps: [
        {
          name: "Fail build",
          run: [
            "mkdir -p dist",
            "echo incomplete > dist/index.txt",
            "exit 1",
          ].join(" && "),
        },
      ],

      artifacts: {
        upload: [
          {
            name: "frontend",
            path: "dist",
          },
        ],
      },
    },

    deploy: {
      needs: ["build"],
      steps: [
        {
          name: "Should never execute",
          run: "echo should-not-run",
        },
      ],
    },
  },
};

// ========================================
// WORKFLOW 3: MISSING ARTIFACT
// ========================================

const missingArtifactWorkflow: Workflow = {
  name: "artifact-missing",
  webhook: {
    url: "/test/artifact-missing",
  },
  trigger: {
    events: ["push"],
  },

  jobs: {
    build: {
      steps: [
        {
          name: "Build without uploading",
          run: "echo build-succeeded",
        },
      ],
    },

    deploy: {
      needs: ["build"],

      artifacts: {
        download: [
          {
            fromJob: "build",
            name: "nonexistent",
            path: "dist",
          },
        ],
      },

      steps: [
        {
          name: "Should never execute",
          run: "echo should-not-run",
        },
      ],
    },
  },
};

// ========================================
// HELPER: WAIT FOR PIPELINE COMPLETION
// ========================================

async function waitForCompletion(engine: PipelineEngine, runId: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const run = engine.getRun(runId);

    assert.ok(run, "Pipeline run should exist");

    if (run.status === "SUCCESS" || run.status === "FAILED") {
      return run;
    }

    await sleep(100);
  }

  throw new Error(`Pipeline ${runId} did not finish within 30 seconds`);
}

// ========================================
// HELPER: START AND WAIT
// ========================================

const storageRoot = await initializeArtifactStorage();

const runsToClean: string[] = [];

async function startAndWait(engine: PipelineEngine) {
  const started = await engine.run();

  runsToClean.push(started.id);

  return await waitForCompletion(engine, started.id);
}

// ========================================
// INTEGRATION TESTS
// ========================================

try {
  // ----------------------------------------
  // TEST 1: Cross-job artifact transfer
  // ----------------------------------------

  const successEngine = new PipelineEngine(successWorkflow);

  const successfulRun = await startAndWait(successEngine);

  assert.equal(successfulRun.status, "SUCCESS");

  assert.equal(successfulRun.jobs["build"]?.status, "SUCCESS");

  assert.equal(successfulRun.jobs["deploy"]?.status, "SUCCESS");

  console.log("Test 1 passed: Cross-job artifact pipeline succeeded");

  // ----------------------------------------
  // TEST 2: Verify stored artifact contents
  // ----------------------------------------

  const storedPath = await getArtifactPath(
    successfulRun.id,
    "build",
    "frontend",
  );

  const indexContent = await readFile(join(storedPath, "index.txt"), "utf8");

  const assetContent = await readFile(
    join(storedPath, "assets", "app.txt"),
    "utf8",
  );

  assert.equal(indexContent.trim(), "hello-from-build");

  assert.equal(assetContent.trim(), "asset-ready");

  console.log("Test 2 passed: Persisted directory contents verified");

  // ----------------------------------------
  // TEST 3: Failed builds must not upload
  // ----------------------------------------

  const failureEngine = new PipelineEngine(failureWorkflow);

  const failedRun = await startAndWait(failureEngine);

  assert.equal(failedRun.status, "FAILED");

  assert.equal(failedRun.jobs["build"]?.status, "FAILED");

  assert.equal(failedRun.jobs["deploy"]?.status, "SKIPPED");

  const failedArtifactPath = await getArtifactPath(
    failedRun.id,
    "build",
    "frontend",
  );

  await assert.rejects(() => access(failedArtifactPath), { code: "ENOENT" });

  console.log("Test 3 passed: Failed build did not upload artifacts");

  // ----------------------------------------
  // TEST 4: Missing artifact must fail
  // ----------------------------------------

  const missingEngine = new PipelineEngine(missingArtifactWorkflow);

  const missingRun = await startAndWait(missingEngine);

  assert.equal(missingRun.status, "FAILED");

  assert.equal(missingRun.jobs["build"]?.status, "SUCCESS");

  assert.equal(missingRun.jobs["deploy"]?.status, "FAILED");

  console.log("Test 4 passed: Missing artifact rejected by consumer");

  // ----------------------------------------
  // TEST 5: Pipeline run isolation
  // ----------------------------------------

  const secondRun = await startAndWait(successEngine);

  assert.equal(secondRun.status, "SUCCESS");

  assert.notEqual(secondRun.id, successfulRun.id);

  const secondArtifactPath = await getArtifactPath(
    secondRun.id,
    "build",
    "frontend",
  );

  assert.notEqual(secondArtifactPath, storedPath);

  await access(storedPath);
  await access(secondArtifactPath);

  console.log("Test 5 passed: Artifacts isolated by pipeline run");

  console.log("All Cross-Job Artifact Integration tests passed!");
} finally {
  // Delete only artifacts created by these tests.
  // Do not delete the entire storage directory.

  for (const runId of runsToClean) {
    await rm(join(storageRoot, runId), {
      recursive: true,
      force: true,
    });
  }
}
