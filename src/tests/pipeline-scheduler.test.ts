import assert from "node:assert/strict";
import RunPipeline from "../pipeline/pipeline-run.js";
import type { Workflow } from "../workflow/workflow.js";
import { runScheduler } from "../scheduler/pipeline-scheduler.js";

// TEST 1: Jobs must execute in dependency order.

const workflow = {
  name: "scheduler-test",
  webhook: { url: "/test" },
  trigger: { events: ["push"] },
  jobs: {
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
  },
} as Workflow;

const run = new RunPipeline(workflow);
run.start();

await runScheduler(workflow, run);

assert.equal(run.jobs.build?.status, "SUCCESS");
assert.equal(run.jobs.test?.status, "SUCCESS");
assert.equal(run.jobs.deploy?.status, "SUCCESS");

// TEST 2: Failed dependencies must propagate SKIPPED.

const failureWorkflow = {
  name: "failure-test",
  webhook: { url: "/failure" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [{ name: "Fail build", run: "exit 1" }],
    },
    test: {
      needs: ["build"],
      steps: [{ name: "Test", run: "echo test" }],
    },
    deploy: {
      needs: ["test"],
      steps: [{ name: "Deploy", run: "echo deploy" }],
    },
    independent: {
      steps: [{ name: "Independent", run: "echo works" }],
    },
  },
} as Workflow;

const failedRun = new RunPipeline(failureWorkflow);
failedRun.start();

await runScheduler(failureWorkflow, failedRun);

assert.equal(failedRun.jobs.build?.status, "FAILED");
assert.equal(failedRun.jobs.test?.status, "SKIPPED");
assert.equal(failedRun.jobs.deploy?.status, "SKIPPED");
assert.equal(failedRun.jobs.independent?.status, "SUCCESS");

// TEST 3: An empty workflow must terminate.

const emptyWorkflow = {
  name: "empty-test",
  webhook: { url: "/empty" },
  trigger: { events: ["push"] },
  jobs: {},
} as Workflow;

const emptyRun = new RunPipeline(emptyWorkflow);
emptyRun.start();

await runScheduler(emptyWorkflow, emptyRun);

assert.deepEqual(emptyRun.jobs, {});

console.log("All PipelineScheduler tests passed!");
