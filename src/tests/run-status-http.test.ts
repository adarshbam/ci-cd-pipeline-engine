import assert from "node:assert/strict";

const endpoint = "http://localhost:3000/github/ci-cd";

// Test 1: Unknown run returns 404
const missingResponse = await fetch(`${endpoint}/runs/nonexistent-run-id`);

assert.equal(missingResponse.status, 404);
assert.deepEqual(await missingResponse.json(), {
  error: "Run not found",
});

console.log("Test 1 passed: Unknown run returns 404");

// Test 2: Create a real pipeline run
const startResponse = await fetch(endpoint);

assert.equal(startResponse.status, 202);

const started = (await startResponse.json()) as {
  runId: string;
};

assert.ok(started.runId);

// Test 3: Existing run returns 200
const statusResponse = await fetch(`${endpoint}/runs/${started.runId}`);

assert.equal(statusResponse.status, 200);

const run = (await statusResponse.json()) as {
  runId: string;
  pipelineId: string;
  status: string;
};

assert.equal(run.runId, started.runId);
assert.ok(run.pipelineId);
assert.ok(run.status);

console.log("Test 2 passed: Valid run returns 200");
console.log("All HTTP status tests passed!");
