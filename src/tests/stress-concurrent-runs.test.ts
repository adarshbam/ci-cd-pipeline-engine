import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const stressWorkflow: Workflow = {
  name: "stress-test-workflow",
  webhook: {
    url: "/webhooks/stress-test",
    methods: ["POST"],
  },
  trigger: {
    events: ["push"],
    allowedBranches: ["main"],
  },
  jobs: {
    lint: {
      steps: [
        {
          name: "quick-lint",
          run: "echo 'Linting concurrent execution batch'",
        },
      ],
    },
    build: {
      needs: ["lint"],
      steps: [
        {
          name: "compile-assets",
          run: "echo 'Compiling concurrent runner payload'",
        },
      ],
    },
    test: {
      needs: ["build"],
      steps: [
        {
          name: "unit-tests",
          run: "echo 'Executing unit test matrix under stress load'",
        },
      ],
    },
  },
};

console.log("Starting Concurrency & Stress Load Test...");

const engine = new PipelineEngine(stressWorkflow);
const CONCURRENT_RUNS = 10;
const runPromises: Promise<any>[] = [];

const startTime = Date.now();

// Launch 10 concurrent pipeline runs simultaneously
for (let i = 0; i < CONCURRENT_RUNS; i++) {
  runPromises.push(engine.run("main"));
}

const runs = await Promise.all(runPromises);

assert.equal(runs.length, CONCURRENT_RUNS);
const uniqueIds = new Set(runs.map((r) => r.id));
assert.equal(
  uniqueIds.size,
  CONCURRENT_RUNS,
  "All concurrent runs must have unique IDs",
);

console.log(`Launched ${CONCURRENT_RUNS} concurrent pipeline executions.`);

// Wait for all runs to complete
const completionWaiters = runs.map((run) =>
  engine.waitForCompletion(run.id),
);

const completedRuns = await Promise.all(completionWaiters);

const elapsedMs = Date.now() - startTime;
console.log(`All ${CONCURRENT_RUNS} runs completed in ${elapsedMs}ms.`);

// Assert all completed successfully
for (const run of completedRuns) {
  assert.equal(
    run.status,
    "SUCCESS",
    `Run ${run.id} did not finish with SUCCESS status`,
  );
  assert.ok(run.jobs?.lint);
  assert.ok(run.jobs?.build);
  assert.ok(run.jobs?.test);
  assert.equal(run.jobs.lint.status, "SUCCESS");
  assert.equal(run.jobs.build.status, "SUCCESS");
  assert.equal(run.jobs.test.status, "SUCCESS");
}

// Verify metrics
const snapshot = engine.getMetricsSnapshot();
assert.equal(snapshot.totalRuns, CONCURRENT_RUNS);
assert.equal(snapshot.successfulRuns, CONCURRENT_RUNS);
assert.equal(snapshot.failedRuns, 0);
assert.equal(engine.getActiveRunCount(), 0);

console.log("ALL STRESS & CONCURRENT EXECUTION TESTS PASSED!");
