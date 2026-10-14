import assert from "node:assert/strict";

import RunPipeline from "../pipeline/pipeline-run.js";
import { getReadyJobs } from "../scheduler/job-scheduler.js";
import type { Workflow } from "../workflow/workflow.js";

const workflow = {
  name: "scheduler-test",
  webhook: { url: "/test" },
  trigger: { events: ["push"] },
  jobs: {
    build: {
      steps: [],
    },
    lint: {
      steps: [],
    },
    test: {
      needs: ["build"],
      steps: [],
    },
    deploy: {
      needs: ["test", "lint"],
      steps: [],
    },
  },
} as Workflow;

const run = new RunPipeline(workflow);

// TEST 1: Jobs without dependencies are ready.
assert.deepEqual(getReadyJobs(workflow, run), ["build", "lint"]);

// TEST 2: Running jobs cannot be scheduled again.
run.jobs.build!.status = "RUNNING";

assert.deepEqual(getReadyJobs(workflow, run), ["lint"]);

// TEST 3: A successful dependency unlocks a job.
run.jobs.build!.status = "SUCCESS";

assert.deepEqual(getReadyJobs(workflow, run), ["lint", "test"]);

// TEST 4: A running dependent job is not ready.
run.jobs.test!.status = "RUNNING";

assert.deepEqual(getReadyJobs(workflow, run), ["lint"]);

// TEST 5: A failed dependency blocks deployment.
run.jobs.test!.status = "SUCCESS";
run.jobs.lint!.status = "FAILED";

assert.deepEqual(getReadyJobs(workflow, run), []);

// TEST 6: All dependencies succeeded.
run.jobs.lint!.status = "SUCCESS";

assert.deepEqual(getReadyJobs(workflow, run), ["deploy"]);

// TEST 7: Completed jobs cannot be scheduled again.
run.jobs.deploy!.status = "SUCCESS";

assert.deepEqual(getReadyJobs(workflow, run), []);

console.log("All JobScheduler readiness tests passed!");
