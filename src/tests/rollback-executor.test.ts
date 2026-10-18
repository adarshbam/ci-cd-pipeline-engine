import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { executeRollback } from "../rollback/rollback-executor.js";

// TEST 1 — Successful rollback
{
  let executed = false;

  const result = await executeRollback(async () => {
    executed = true;
  });

  assert.equal(executed, true);
  assert.equal(result.status, "SUCCESS");
  assert.ok(result.durationMs >= 0);
  assert.equal(result.error, undefined);

  console.log("Test 1 passed: Successful rollback");
}

// TEST 2 — Failed rollback returns failure
{
  const result = await executeRollback(async () => {
    throw new Error("Previous deployment unavailable");
  });

  assert.equal(result.status, "FAILED");
  assert.match(result.error ?? "", /Previous deployment unavailable/);
  assert.ok(result.durationMs >= 0);

  console.log("Test 2 passed: Failed rollback recorded");
}

// TEST 3 — Asynchronous rollback is awaited
{
  let completed = false;

  const result = await executeRollback(async () => {
    await sleep(60);
    completed = true;
  });

  assert.equal(completed, true);
  assert.equal(result.status, "SUCCESS");
  assert.ok(
    result.durationMs >= 40,
    `Rollback finished too early: ${result.durationMs}ms`,
  );

  console.log("Test 3 passed: Async rollback awaited");
}

// TEST 4 — Rollback executes only once
{
  let attempts = 0;

  const result = await executeRollback(async () => {
    attempts++;
    throw new Error("Rollback failed");
  });

  assert.equal(attempts, 1);
  assert.equal(result.status, "FAILED");

  console.log("Test 4 passed: Rollback executes once");
}

// TEST 5 — Non-Error thrown values are handled
{
  const result = await executeRollback(async () => {
    throw "Rollback command unavailable";
  });

  assert.equal(result.status, "FAILED");
  assert.equal(result.error, "Rollback command unavailable");

  console.log("Test 5 passed: Unknown errors handled");
}

// TEST 6 — Independent rollback executions
{
  let firstExecuted = false;
  let secondExecuted = false;

  const first = await executeRollback(async () => {
    firstExecuted = true;
    throw new Error("First rollback failed");
  });

  const second = await executeRollback(async () => {
    secondExecuted = true;
  });

  assert.equal(firstExecuted, true);
  assert.equal(secondExecuted, true);

  assert.equal(first.status, "FAILED");
  assert.equal(second.status, "SUCCESS");

  console.log("Test 6 passed: Independent rollback executions");
}

console.log("All Rollback Executor tests passed!");
