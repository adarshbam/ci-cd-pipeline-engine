
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

function makeWorkflow(
  name: string,
  jobs: Workflow["jobs"]
): Workflow {
  return {
    name,
    webhook: { url: `/test/${name}` },
    trigger: { events: ["push"] },
    jobs,
  };
}

async function startAndWait(workflow: Workflow) {
  const engine = new PipelineEngine(workflow);
  const run = await engine.run();

  const deadline = Date.now() + 15000;

  while (
    run.status !== "SUCCESS" &&
    run.status !== "FAILED"
  ) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Pipeline ${workflow.name} did not finish`
      );
    }

    await sleep(25);
  }

  return run;
}

// ======================================
// TEST 1 — Failed dependency chain
// ======================================

{
  const workflow = makeWorkflow("blocked-chain", {
    build: {
      steps: [{ name: "Build", run: "exit 1" }],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Test", run: "echo test" }],
    },
    deploy: {
      needs: ["test"],
      steps: [{ name: "Deploy", run: "echo deploy" }],
    },
  });

  const run = await startAndWait(workflow);

  assert.equal(run.status, "FAILED");
  assert.equal(run.jobs.build?.status, "FAILED");
  assert.equal(run.jobs.test?.status, "SKIPPED");
  assert.equal(run.jobs.deploy?.status, "SKIPPED");

  console.log(
    "Test 1 passed: Failure propagates through dependency chain"
  );
}

// ======================================
// TEST 2 — Independent job survives
// ======================================

{
  const workflow = makeWorkflow("independent-survival", {
    build: {
      steps: [{ name: "Build", run: "exit 1" }],
    },
    lint: {
      steps: [{ name: "Lint", run: "echo lint-ok" }],
    },
    deploy: {
      needs: ["build"],
      steps: [{ name: "Deploy", run: "echo deploy" }],
    },
  });

  const run = await startAndWait(workflow);

  assert.equal(run.status, "FAILED");
  assert.equal(run.jobs.build?.status, "FAILED");
  assert.equal(run.jobs.lint?.status, "SUCCESS");
  assert.equal(run.jobs.deploy?.status, "SKIPPED");

  console.log(
    "Test 2 passed: Independent jobs complete despite failure"
  );
}

// ======================================
// TEST 3 — Circular dependency
// ======================================

{
  const workflow = makeWorkflow("direct-cycle", {
    a: {
      needs: ["b"],
      steps: [{ name: "A", run: "echo a" }],
    },
    b: {
      needs: ["a"],
      steps: [{ name: "B", run: "echo b" }],
    },
  });

  const run = await startAndWait(workflow);

  assert.equal(
    run.status,
    "FAILED",
    "Circular dependency must fail the pipeline"
  );

  assert.notEqual(run.jobs.a?.status, "SUCCESS");
  assert.notEqual(run.jobs.b?.status, "SUCCESS");

  console.log(
    "Test 3 passed: Circular dependencies fail the pipeline"
  );
}

// ======================================
// TEST 4 — Cycle with independent job
// ======================================

{
  const workflow = makeWorkflow("mixed-cycle", {
    a: {
      needs: ["b"],
      steps: [{ name: "A", run: "echo a" }],
    },
    b: {
      needs: ["a"],
      steps: [{ name: "B", run: "echo b" }],
    },
    lint: {
      steps: [{ name: "Lint", run: "echo lint-ok" }],
    },
  });

  const run = await startAndWait(workflow);

  assert.equal(run.status, "FAILED");
  assert.equal(run.jobs.lint?.status, "SUCCESS");

  assert.notEqual(run.jobs.a?.status, "SUCCESS");
  assert.notEqual(run.jobs.b?.status, "SUCCESS");

  console.log(
    "Test 4 passed: Independent job finishes before cycle failure"
  );
}

// ======================================
// TEST 5 — Valid chain isn't a cycle
// ======================================

{
  const workflow = makeWorkflow("valid-chain", {
    build: {
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
  });

  const run = await startAndWait(workflow);

  assert.equal(run.status, "SUCCESS");
  assert.equal(run.jobs.build?.status, "SUCCESS");
  assert.equal(run.jobs.test?.status, "SUCCESS");
  assert.equal(run.jobs.deploy?.status, "SUCCESS");

  console.log(
    "Test 5 passed: Valid dependency chain succeeds"
  );
}

// ======================================
// TEST 6 — Multiple prerequisites
// ======================================

{
  const workflow = makeWorkflow("multiple-prerequisites", {
    build: {
      steps: [{ name: "Build", run: "echo build" }],
    },
    lint: {
      steps: [{ name: "Lint", run: "echo lint" }],
    },
    test: {
      needs: ["build", "lint"],
      steps: [{ name: "Test", run: "echo test" }],
    },
    deploy: {
      needs: ["test"],
      steps: [{ name: "Deploy", run: "echo deploy" }],
    },
  });

  const run = await startAndWait(workflow);

  assert.equal(run.status, "SUCCESS");

  for (const jobId of Object.keys(workflow.jobs)) {
    assert.equal(
      run.jobs[jobId]?.status,
      "SUCCESS",
      `${jobId} must succeed`
    );
  }

  console.log(
    "Test 6 passed: Multiple prerequisites resolved"
  );
}

console.log(
  "All Dependency Robustness tests passed!"
);
