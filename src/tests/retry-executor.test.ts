import assert from "node:assert/strict";

import { executeWithRetries } from "../steps/retry-executor.js";
import type { StepExecutionResult } from "../types/step-result.js";

function makeResult(status: "SUCCESS" | "FAILED"): StepExecutionResult {
  return {
    status,
    exitCode: status === "SUCCESS" ? 0 : 1,
    stdout: status === "SUCCESS" ? "ok" : "",
    stderr: status === "FAILED" ? "failed" : "",
    startedAt: new Date(),
    finishedAt: new Date(),
  };
}

// TEST 1: Success on the first attempt
{
  let attempts = 0;

  const result = await executeWithRetries(async () => {
    attempts++;
    return makeResult("SUCCESS");
  }, 3);

  assert.equal(result.status, "SUCCESS");
  assert.equal(attempts, 1);

  console.log("Test 1 passed: Stops on first success");
}

// TEST 2: Failure followed by success
{
  let attempts = 0;

  const result = await executeWithRetries(async () => {
    attempts++;

    return makeResult(attempts === 3 ? "SUCCESS" : "FAILED");
  }, 2);

  assert.equal(result.status, "SUCCESS");
  assert.equal(attempts, 3);

  console.log("Test 2 passed: Retries until success");
}

// TEST 3: Retries exhausted
{
  let attempts = 0;

  const result = await executeWithRetries(async () => {
    attempts++;
    return makeResult("FAILED");
  }, 2);

  assert.equal(result.status, "FAILED");
  assert.equal(attempts, 3);

  console.log("Test 3 passed: Retry limit enforced");
}

// TEST 4: No retries configured
{
  let attempts = 0;

  const result = await executeWithRetries(async () => {
    attempts++;
    return makeResult("FAILED");
  });

  assert.equal(result.status, "FAILED");
  assert.equal(attempts, 1);

  console.log("Test 4 passed: Missing retries defaults to zero");
}

// TEST 5: Explicit zero retries
{
  let attempts = 0;

  const result = await executeWithRetries(async () => {
    attempts++;
    return makeResult("FAILED");
  }, 0);

  assert.equal(result.status, "FAILED");
  assert.equal(attempts, 1);

  console.log("Test 5 passed: Zero retries executes once");
}

// TEST 6: Return the last failed result
{
  let attempts = 0;

  const result = await executeWithRetries(async () => {
    attempts++;

    return {
      ...makeResult("FAILED"),
      stderr: `failure-${attempts}`,
    };
  }, 2);

  assert.equal(attempts, 3);
  assert.equal(result.stderr, "failure-3");

  console.log("Test 6 passed: Last failure returned");
}

// TEST 7: Invalid retries rejected before execution
{
  let attempts = 0;

  await assert.rejects(
    () =>
      executeWithRetries(async () => {
        attempts++;
        return makeResult("SUCCESS");
      }, -1),
    Error,
  );

  assert.equal(attempts, 0);

  console.log("Test 7 passed: Invalid retries rejected");
}

// TEST 8: Unexpected exception propagates
{
  let attempts = 0;

  await assert.rejects(
    () =>
      executeWithRetries(async () => {
        attempts++;
        throw new Error("Unexpected execution error");
      }, 3),
    /Unexpected execution error/,
  );

  assert.equal(attempts, 1);

  console.log("Test 8 passed: Unexpected errors propagate");
}

console.log("All Retry Executor tests passed!");
