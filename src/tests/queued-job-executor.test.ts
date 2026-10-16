import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { JobQueue } from "../scheduler/job-queue.js";
import { ConcurrencyLimiter } from "../scheduler/concurrency-limiter.js";
import { executeQueuedJobs } from "../scheduler/queued-job-executor.js";

// ==============================================
// TEST 1 — Empty queue
// ==============================================

{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(2);

  let executed = false;

  const results = await executeQueuedJobs(queue, limiter, async () => {
    executed = true;
    return "unexpected";
  });

  assert.deepEqual(results, []);
  assert.equal(executed, false);

  console.log("Test 1 passed: Empty queue");
}

// ==============================================
// TEST 2 — FIFO ordering with one slot
// ==============================================

{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(1);

  queue.enqueue("build");
  queue.enqueue("test");
  queue.enqueue("deploy");

  const executionOrder: string[] = [];

  const results = await executeQueuedJobs(queue, limiter, async (jobId) => {
    executionOrder.push(jobId);
    await sleep(10);
    return `${jobId}-complete`;
  });

  assert.deepEqual(executionOrder, ["build", "test", "deploy"]);

  assert.deepEqual(results, [
    "build-complete",
    "test-complete",
    "deploy-complete",
  ]);

  assert.equal(queue.size, 0);

  console.log("Test 2 passed: FIFO execution");
}

// ==============================================
// TEST 3 — Multiple jobs run concurrently
// ==============================================

{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(2);

  for (const jobId of ["build", "test", "lint", "package", "deploy"]) {
    queue.enqueue(jobId);
  }

  let active = 0;
  let maximumObserved = 0;

  const results = await executeQueuedJobs(queue, limiter, async (jobId) => {
    active++;

    maximumObserved = Math.max(maximumObserved, active);

    await sleep(30);

    active--;

    return jobId;
  });

  assert.equal(maximumObserved, 2);

  assert.deepEqual(results, ["build", "test", "lint", "package", "deploy"]);

  assert.equal(active, 0);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.pendingCount, 0);

  console.log("Test 3 passed: Concurrent execution limited to two");
}

// ==============================================
// TEST 4 — Waiting jobs do not start early
// ==============================================

{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(1);

  queue.enqueue("build");
  queue.enqueue("test");
  queue.enqueue("deploy");

  const started: string[] = [];

  let releaseBuild!: () => void;

  const gate = new Promise<void>((resolve) => {
    releaseBuild = resolve;
  });

  const execution = executeQueuedJobs(queue, limiter, async (jobId) => {
    started.push(jobId);

    if (jobId === "build") {
      await gate;
    }

    return jobId;
  });

  await sleep(10);

  assert.deepEqual(started, ["build"]);
  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.pendingCount, 2);

  releaseBuild();

  const results = await execution;

  assert.deepEqual(started, ["build", "test", "deploy"]);

  assert.deepEqual(results, ["build", "test", "deploy"]);

  console.log("Test 4 passed: Waiting jobs respect available slots");
}

// ==============================================
// TEST 5 — Duplicate queue entries are ignored
// ==============================================

{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(2);

  queue.enqueue("build");
  queue.enqueue("build");
  queue.enqueue("test");
  queue.enqueue("test");

  const executed: string[] = [];

  await executeQueuedJobs(queue, limiter, async (jobId) => {
    executed.push(jobId);
    return jobId;
  });

  assert.deepEqual(executed, ["build", "test"]);

  console.log("Test 5 passed: Duplicate queued jobs not executed twice");
}

// ==============================================
// TEST 6 — Results preserve submission order
// ==============================================

{
  const queue = new JobQueue();
  const limiter = new ConcurrencyLimiter(3);

  queue.enqueue("slow");
  queue.enqueue("fast");
  queue.enqueue("medium");

  const completionOrder: string[] = [];

  const results = await executeQueuedJobs(queue, limiter, async (jobId) => {
    const delays: Record<string, number> = {
      slow: 60,
      fast: 5,
      medium: 25,
    };

    await sleep(delays[jobId] ?? 0);

    completionOrder.push(jobId);

    return `${jobId}-result`;
  });

  assert.deepEqual(completionOrder, ["fast", "medium", "slow"]);

  assert.deepEqual(results, ["slow-result", "fast-result", "medium-result"]);

  console.log("Test 6 passed: Results preserve submission order");
}

console.log("All Queued Job Executor tests passed!");
