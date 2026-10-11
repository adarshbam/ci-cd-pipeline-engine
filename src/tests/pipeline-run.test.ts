import RunPipeline from "../pipeline/pipeline-run.js";
import type { Workflow } from "../workflow/workflow.js";

import assert from "node:assert/strict";

export const workflow = {
  name: "vault-deployment",
  webhook: { url: "/test" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [],
    },
    test: {
      needs: ["build"],
      steps: [],
    },
  },
} as Workflow;

// Test initial state
const initialRun = new RunPipeline(workflow);

assert.equal(initialRun.status, "QUEUED");
assert.equal(initialRun.startedAt, undefined);
assert.equal(initialRun.finishedAt, undefined);

// Test successful completion
const successRun = new RunPipeline(workflow);

successRun.start();

assert.equal(successRun.status, "RUNNING");
assert.ok(successRun.startedAt instanceof Date);

successRun.complete();

assert.equal(successRun.status, "SUCCESS");
assert.ok(successRun.finishedAt instanceof Date);

const run = new RunPipeline(workflow);

// Cannot complete before starting.
assert.throws(() => run.complete());

// Cannot fail before starting.
assert.throws(() => run.fail());

run.start();

// Cannot start twice.
assert.throws(() => run.start());

run.complete();

// Cannot complete twice.
assert.throws(() => run.complete());

// Cannot fail after success.
assert.throws(() => run.fail());

const failedRun = new RunPipeline(workflow);

failedRun.start();
failedRun.fail();

assert.equal(failedRun.status, "FAILED");
assert.ok(failedRun.finishedAt instanceof Date);

// A failed run cannot be completed or failed again.
assert.throws(() => failedRun.complete());
assert.throws(() => failedRun.fail());

console.log("All PipelineRun lifecycle tests passed!");
