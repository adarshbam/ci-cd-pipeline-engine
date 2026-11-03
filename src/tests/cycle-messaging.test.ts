import assert from "node:assert/strict";
import { validateWorkflow } from "../routes/webhook.routes.js";
import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

// TEST 1 — Static Workflow DAG Cycle Validation
{
  const cyclicWf: Workflow = {
    name: "test-cycle-validation",
    webhook: { url: "/webhooks/test-cycle" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        needs: ["deploy"],
        steps: [{ name: "Build", run: "echo build" }],
      },
      test: {
        needs: ["build"],
        steps: [{ name: "Test", run: "echo test" }],
      },
      deploy: {
        needs: ["test"],
        steps: [{ name: "Deploy", run: "echo deploy" }],
      },
    },
  };

  const validation = validateWorkflow(cyclicWf);
  assert.equal(validation.isValid, false, "Cyclic workflow must be invalid");
  assert.ok(
    validation.errors.some((err) =>
      err.includes("Circular dependency detected"),
    ),
    "Validation errors must mention circular dependency",
  );
  console.log("Test 1 passed: Static DAG cycle detection identifies cycle");
}

// TEST 2 — Scheduler Runtime Cycle Detection Sets Explicit Failure Reasons
{
  const cyclicRuntimeWf: Workflow = {
    name: "test-runtime-cycle",
    webhook: { url: "/webhooks/runtime-cycle" },
    trigger: { events: ["push"] },
    jobs: {
      alpha: {
        needs: ["beta"],
        steps: [{ name: "Alpha", run: "echo alpha" }],
      },
      beta: {
        needs: ["alpha"],
        steps: [{ name: "Beta", run: "echo beta" }],
      },
    },
  };

  const engine = new PipelineEngine(cyclicRuntimeWf);
  const run = await engine.run("main");
  const completedRun = await engine.waitForCompletion(run.id);

  assert.equal(completedRun.status, "FAILED", "Pipeline run status must be FAILED");
  assert.ok(
    completedRun.failureReason?.includes("Cycle Detected"),
    `Run failureReason must mention Cycle Detected, got: ${completedRun.failureReason}`,
  );

  assert.equal(completedRun.jobs.alpha?.status, "FAILED");
  assert.ok(
    completedRun.jobs.alpha?.failureReason?.includes("Cycle Detected"),
    `Job alpha must have Cycle Detected failureReason, got: ${completedRun.jobs.alpha?.failureReason}`,
  );

  assert.equal(completedRun.jobs.beta?.status, "FAILED");
  assert.ok(
    completedRun.jobs.beta?.failureReason?.includes("Cycle Detected"),
    `Job beta must have Cycle Detected failureReason, got: ${completedRun.jobs.beta?.failureReason}`,
  );

  console.log("Test 2 passed: Runtime cycle detection sets explicit failureReason on run and jobs");
}

// TEST 3 — Vault Storage Workflow is a Valid DAG
{
  const { loadWorkflows } = await import("../workflow/workflow-loader.js");
  const workflows = await loadWorkflows();
  const vaultWf = workflows.find((w) => w.name === "vault-storage");

  assert.ok(vaultWf, "vault-storage workflow must be loaded");
  const validation = validateWorkflow(vaultWf);
  assert.equal(
    validation.isValid,
    true,
    `vault-storage workflow must be valid DAG, got errors: ${validation.errors.join(", ")}`,
  );

  assert.ok(vaultWf.jobs["sync-repository"]);
  assert.ok(vaultWf.jobs["test-frontend"]);
  assert.ok(vaultWf.jobs["deploy-frontend"]);
  assert.ok(vaultWf.jobs["deploy-backend"]);
  assert.ok(vaultWf.jobs["verify-deployment"]);

  console.log("Test 3 passed: vault-storage workflow is fully validated with 5 DAG jobs");
}

console.log("ALL CYCLE MESSAGING & WORKFLOW TESTS PASSED!");
