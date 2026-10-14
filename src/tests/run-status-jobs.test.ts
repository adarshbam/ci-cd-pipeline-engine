import assert from "node:assert/strict";

const endpoint = "http://localhost:3000/github/ci-cd";

type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

interface RunResponse {
  runId: string;
  pipelineId: string;
  status: string;
  jobs: Record<
    string,
    {
      jobId: string;
      status: JobStatus;
    }
  >;
}

// Test 1: Create a new pipeline
const startResponse = await fetch(endpoint);

assert.equal(startResponse.status, 202);

const started = (await startResponse.json()) as {
  runId: string;
  pipelineId: string;
};

assert.ok(started.runId);

console.log("Test 1 passed: Pipeline created");

// Test 2: Retrieve the pipeline
const response = await fetch(`${endpoint}/runs/${started.runId}`);

assert.equal(response.status, 200);

const run = (await response.json()) as RunResponse;

assert.equal(run.runId, started.runId);
assert.equal(run.pipelineId, started.pipelineId);

console.log("Test 2 passed: Pipeline retrieved");

// Test 3: Jobs object exists
assert.ok(run.jobs);
assert.equal(typeof run.jobs, "object");
assert.equal(Array.isArray(run.jobs), false);

const jobIds = Object.keys(run.jobs);

assert.ok(jobIds.length > 0);

console.log("Test 3 passed: Jobs object exists");

// Test 4: Every job has a valid status
const validStatuses: JobStatus[] = [
  "QUEUED",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
];

for (const [jobId, job] of Object.entries(run.jobs)) {
  assert.equal(job.jobId, jobId);

  assert.ok(
    validStatuses.includes(job.status),
    `Invalid status for job ${jobId}: ${job.status}`,
  );
}

console.log("Test 4 passed: All job statuses valid");

console.log("All RunStatus Jobs tests passed!");
