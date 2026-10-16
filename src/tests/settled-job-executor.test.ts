import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { JobQueue } from "../scheduler/job-queue.js";
import { ConcurrencyLimiter } from "../scheduler/concurrency-limiter.js";
import { executeQueuedJobsSettled } from "../scheduler/settled-job-executor.js";

// TEST 1 — Empty queue
{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(2);

  const results = await executeQueuedJobsSettled(
    queue,
    limiter,
    async (jobId) => jobId,
  );

  assert.deepEqual(results, []);

  console.log("Test 1 passed: Empty queue");
}

// TEST 2 — All successful jobs
{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(2);

  queue.enqueue("build");
  queue.enqueue("test");

  const results = await executeQueuedJobsSettled(
    queue,
    limiter,
    async (jobId) => `${jobId}-done`,
  );

  assert.deepEqual(results, [
    { status: "fulfilled", value: "build-done" },
    { status: "fulfilled", value: "test-done" },
  ]);

  console.log("Test 2 passed: Successful results preserved");
}

// TEST 3 — One rejection must not finish the batch early
{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(2);

  queue.enqueue("build");
  queue.enqueue("test");

  let releaseTest!: () => void;

  const testGate = new Promise<void>((resolve) => {
    releaseTest = resolve;
  });

  let batchFinished = false;

  const batch = executeQueuedJobsSettled(queue, limiter, async (jobId) => {
    if (jobId === "build") {
      throw new Error("Build exploded");
    }

    await testGate;
    return "test-success";
  });

  void batch.then(() => {
    batchFinished = true;
  });

  await sleep(20);

  assert.equal(
    batchFinished,
    false,
    "Batch must wait for the unfinished test job",
  );

  releaseTest();

  const results = await batch;

  assert.equal(results[0]?.status, "rejected");

  if (results[0]?.status === "rejected") {
    assert.match(String(results[0].reason), /Build exploded/);
  }

  assert.deepEqual(results[1], {
    status: "fulfilled",
    value: "test-success",
  });

  console.log("Test 3 passed: Rejection waits for other jobs");
}

// TEST 4 — Failed jobs release execution slots
{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(1);

  queue.enqueue("failed");
  queue.enqueue("recovery");

  const started: string[] = [];

  const results = await executeQueuedJobsSettled(
    queue,
    limiter,
    async (jobId) => {
      started.push(jobId);

      if (jobId === "failed") {
        throw new Error("Expected failure");
      }

      return "recovered";
    },
  );

  assert.deepEqual(started, ["failed", "recovery"]);
  assert.equal(results[0]?.status, "rejected");
  assert.deepEqual(results[1], {
    status: "fulfilled",
    value: "recovered",
  });

  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);

  console.log("Test 4 passed: Failure releases slot for next job");
}

// TEST 5 — Concurrency limit still applies
{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(2);

  for (const jobId of ["A", "B", "C", "D"]) {
    queue.enqueue(jobId);
  }

  let active = 0;
  let maximumObserved = 0;

  const results = await executeQueuedJobsSettled(
    queue,
    limiter,
    async (jobId) => {
      active++;

      maximumObserved = Math.max(maximumObserved, active);

      try {
        await sleep(30);
        return jobId;
      } finally {
        active--;
      }
    },
  );

  assert.equal(maximumObserved, 2);
  assert.equal(active, 0);
  assert.equal(results.length, 4);
  assert.equal(limiter.activeCount, 0);

  console.log("Test 5 passed: Concurrency limit preserved");
}

// TEST 6 — Results maintain submission order
{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(3);

  queue.enqueue("slow");
  queue.enqueue("failed");
  queue.enqueue("fast");

  const results = await executeQueuedJobsSettled(
    queue,
    limiter,
    async (jobId) => {
      if (jobId === "slow") {
        await sleep(40);
        return "slow-done";
      }

      if (jobId === "failed") {
        throw new Error("Failure");
      }

      return "fast-done";
    },
  );

  assert.equal(results[0]?.status, "fulfilled");
  assert.equal(results[1]?.status, "rejected");
  assert.equal(results[2]?.status, "fulfilled");

  if (results[0]?.status === "fulfilled") {
    assert.equal(results[0].value, "slow-done");
  }

  if (results[2]?.status === "fulfilled") {
    assert.equal(results[2].value, "fast-done");
  }

  console.log("Test 6 passed: Submission order preserved");
}

console.log("All Settled Job Executor tests passed!");
