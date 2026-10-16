import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { ConcurrencyLimiter } from "../scheduler/concurrency-limiter.js";

// TEST 1 — Invalid concurrency limits
{
  for (const value of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(() => new ConcurrencyLimiter(value), Error);
  }

  console.log("Test 1 passed: Invalid limits rejected");
}

// TEST 2 — Single execution
{
  const limiter = new ConcurrencyLimiter(2);

  const result = await limiter.run(async () => {
    assert.equal(limiter.activeCount, 1);
    return "build-complete";
  });

  assert.equal(result, "build-complete");
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);

  console.log("Test 2 passed: Single execution");
}

// TEST 3 — Maximum concurrency is enforced
{
  const limiter = new ConcurrencyLimiter(2);

  let currentlyRunning = 0;
  let maximumObserved = 0;

  const operations = Array.from({ length: 6 }, (_, index) =>
    limiter.run(async () => {
      currentlyRunning++;

      maximumObserved = Math.max(maximumObserved, currentlyRunning);

      await sleep(40);

      currentlyRunning--;

      return index;
    }),
  );

  const results = await Promise.all(operations);

  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
  assert.equal(maximumObserved, 2);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);

  console.log("Test 3 passed: Concurrency limit enforced");
}

// TEST 4 — Waiting operations preserve FIFO order
{
  const limiter = new ConcurrencyLimiter(1);
  const executionOrder: string[] = [];

  const operations = ["A", "B", "C", "D"].map((name) =>
    limiter.run(async () => {
      executionOrder.push(name);
      await sleep(15);
      return name;
    }),
  );

  await Promise.all(operations);

  assert.deepEqual(executionOrder, ["A", "B", "C", "D"]);

  console.log("Test 4 passed: FIFO execution");
}

// TEST 5 — Failed operations release their slots
{
  const limiter = new ConcurrencyLimiter(1);

  await assert.rejects(
    () =>
      limiter.run(async () => {
        throw new Error("Build failed");
      }),
    /Build failed/,
  );

  assert.equal(limiter.activeCount, 0);

  const result = await limiter.run(async () => "next-job-succeeded");

  assert.equal(result, "next-job-succeeded");

  console.log("Test 5 passed: Failed operation releases slot");
}

// TEST 6 — Pending jobs are tracked
{
  const limiter = new ConcurrencyLimiter(1);

  let releaseFirst!: () => void;

  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = limiter.run(async () => {
    await firstGate;
    return "first";
  });

  const second = limiter.run(async () => "second");
  const third = limiter.run(async () => "third");

  // Allow scheduling microtasks to settle.
  await sleep(10);

  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.pendingCount, 2);

  releaseFirst();

  const results = await Promise.all([first, second, third]);

  assert.deepEqual(results, ["first", "second", "third"]);

  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);

  console.log("Test 6 passed: Pending operations tracked");
}

console.log("All Concurrency Limiter tests passed!");
