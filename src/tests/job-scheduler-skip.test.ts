import assert from "node:assert/strict";

import RunPipeline from "../pipeline/pipeline-run.js";
import { skipBlockedJobs } from "../scheduler/job-scheduler.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = {
  name: "dependency-test",
  webhook: { url: "/test" },
  trigger: { events: ["push"] },
  jobs: {
    // Intentionally reversed dependency order.
    deploy: {
      needs: ["test"],
      steps: [],
    },
    test: {
      needs: ["build"],
      steps: [],
    },
    lint: {
      steps: [],
    },
    build: {
      steps: [],
    },
    release: {
      needs: ["deploy", "lint"],
      steps: [],
    },
  },
} as Workflow;

// TEST 1: No failed dependencies.
const run1 = new RunPipeline(workflow);

assert.deepEqual(skipBlockedJobs(workflow, run1), []);

assert.equal(run1.jobs.test!.status, "QUEUED");
assert.equal(run1.jobs.deploy!.status, "QUEUED");

// TEST 2: Failure propagates through dependencies.
const run2 = new RunPipeline(workflow);

run2.jobs.build!.status = "FAILED";

const skipped = skipBlockedJobs(workflow, run2);

assert.deepEqual(skipped.sort(), ["deploy", "release", "test"]);

assert.equal(run2.jobs.test!.status, "SKIPPED");
assert.equal(run2.jobs.deploy!.status, "SKIPPED");
assert.equal(run2.jobs.release!.status, "SKIPPED");

// Independent job remains queued.
assert.equal(run2.jobs.lint!.status, "QUEUED");

// TEST 3: Calling again changes nothing.
assert.deepEqual(skipBlockedJobs(workflow, run2), []);

// TEST 4: Cancellation blocks dependent jobs.
const run3 = new RunPipeline(workflow);

run3.jobs.lint!.status = "CANCELLED";

assert.deepEqual(skipBlockedJobs(workflow, run3), ["release"]);

assert.equal(run3.jobs.release!.status, "SKIPPED");
assert.equal(run3.jobs.test!.status, "QUEUED");

// TEST 5: Already running jobs aren't overwritten.
const run4 = new RunPipeline(workflow);

run4.jobs.build!.status = "FAILED";
run4.jobs.test!.status = "RUNNING";

skipBlockedJobs(workflow, run4);

assert.equal(run4.jobs.test!.status, "RUNNING");
assert.equal(run4.jobs.deploy!.status, "QUEUED");

console.log("All dependency propagation tests passed!");
