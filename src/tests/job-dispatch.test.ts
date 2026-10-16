import assert from "node:assert/strict";

import { JobQueue } from "../scheduler/job-queue.js";
import { enqueueReadyJobsOnce } from "../scheduler/job-dispatch.js";

// TEST 1 — No ready jobs
{
  const queue = new JobQueue();
  const scheduled = new Set<string>();

  const added = enqueueReadyJobsOnce(queue, scheduled, []);

  assert.equal(added, 0);
  assert.equal(queue.size, 0);
  assert.equal(scheduled.size, 0);

  console.log("Test 1 passed: Empty ready list");
}

// TEST 2 — New jobs are enqueued in FIFO order
{
  const queue = new JobQueue();
  const scheduled = new Set<string>();

  const added = enqueueReadyJobsOnce(queue, scheduled, [
    "lint",
    "test",
    "build",
  ]);

  assert.equal(added, 3);
  assert.equal(queue.dequeue(), "lint");
  assert.equal(queue.dequeue(), "test");
  assert.equal(queue.dequeue(), "build");

  assert.equal(scheduled.size, 3);

  console.log("Test 2 passed: Ready jobs enqueued");
}

// TEST 3 — Duplicate IDs in one batch
{
  const queue = new JobQueue();
  const scheduled = new Set<string>();

  const added = enqueueReadyJobsOnce(queue, scheduled, [
    "build",
    "build",
    "test",
    "build",
  ]);

  assert.equal(added, 2);
  assert.equal(queue.size, 2);
  assert.equal(queue.dequeue(), "build");
  assert.equal(queue.dequeue(), "test");

  console.log("Test 3 passed: Batch duplicates rejected");
}

// TEST 4 — Dequeued jobs cannot be scheduled again
{
  const queue = new JobQueue();
  const scheduled = new Set<string>();

  enqueueReadyJobsOnce(queue, scheduled, ["build"]);

  assert.equal(queue.dequeue(), "build");
  assert.equal(queue.size, 0);

  // Simulates another scheduler check while build
  // is already running.
  const added = enqueueReadyJobsOnce(queue, scheduled, ["build"]);

  assert.equal(added, 0);
  assert.equal(queue.size, 0);
  assert.equal(scheduled.has("build"), true);

  console.log("Test 4 passed: Running jobs cannot be rescheduled");
}

// TEST 5 — New jobs can arrive in later batches
{
  const queue = new JobQueue();
  const scheduled = new Set<string>();

  enqueueReadyJobsOnce(queue, scheduled, ["build", "lint"]);

  const added = enqueueReadyJobsOnce(queue, scheduled, [
    "build",
    "test",
    "deploy",
  ]);

  assert.equal(added, 2);

  assert.deepEqual(
    [queue.dequeue(), queue.dequeue(), queue.dequeue(), queue.dequeue()],
    ["build", "lint", "test", "deploy"],
  );

  assert.equal(scheduled.size, 4);

  console.log("Test 5 passed: Later batches accept only new jobs");
}

// TEST 6 — Different pipeline runs are independent
{
  const firstQueue = new JobQueue();
  const secondQueue = new JobQueue();

  const firstScheduled = new Set<string>();
  const secondScheduled = new Set<string>();

  enqueueReadyJobsOnce(firstQueue, firstScheduled, ["build"]);

  enqueueReadyJobsOnce(secondQueue, secondScheduled, ["build"]);

  assert.equal(firstQueue.dequeue(), "build");
  assert.equal(secondQueue.dequeue(), "build");

  // Both runs may independently schedule a job
  // with the same ID.
  assert.equal(firstScheduled.size, 1);
  assert.equal(secondScheduled.size, 1);

  console.log("Test 6 passed: Pipeline runs remain independent");
}

console.log("All Job Dispatch tests passed!");
