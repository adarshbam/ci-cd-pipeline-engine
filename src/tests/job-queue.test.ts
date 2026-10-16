import assert from "node:assert/strict";
import { JobQueue } from "../scheduler/job-queue.js";

// TEST 1 — New queue is empty
{
  const queue = new JobQueue();

  assert.equal(queue.size, 0);
  assert.equal(queue.dequeue(), undefined);

  console.log("Test 1 passed: Empty queue");
}

// TEST 2 — FIFO ordering
{
  const queue = new JobQueue();

  queue.enqueue("lint");
  queue.enqueue("test");
  queue.enqueue("build");

  assert.equal(queue.size, 3);

  assert.equal(queue.dequeue(), "lint");
  assert.equal(queue.dequeue(), "test");
  assert.equal(queue.dequeue(), "build");
  assert.equal(queue.dequeue(), undefined);

  console.log("Test 2 passed: FIFO ordering");
}

// TEST 3 — Duplicate jobs are ignored
{
  const queue = new JobQueue();

  queue.enqueue("build");
  queue.enqueue("build");
  queue.enqueue("deploy");
  queue.enqueue("build");

  assert.equal(queue.size, 2);
  assert.equal(queue.dequeue(), "build");
  assert.equal(queue.dequeue(), "deploy");

  console.log("Test 3 passed: Duplicate prevention");
}

// TEST 4 — Membership updates correctly
{
  const queue = new JobQueue();

  queue.enqueue("build");

  assert.equal(queue.has("build"), true);
  assert.equal(queue.has("deploy"), false);

  queue.dequeue();

  assert.equal(queue.has("build"), false);
  assert.equal(queue.size, 0);

  console.log("Test 4 passed: Membership tracking");
}

// TEST 5 — Previously dequeued jobs can be added again
{
  const queue = new JobQueue();

  queue.enqueue("build");
  assert.equal(queue.dequeue(), "build");

  queue.enqueue("build");

  assert.equal(queue.size, 1);
  assert.equal(queue.dequeue(), "build");

  console.log("Test 5 passed: Re-enqueue after dequeue");
}

// TEST 6 — Queue behaves correctly with many jobs
{
  const queue = new JobQueue();
  const jobIds = Array.from({ length: 100 }, (_, i) => `job-${i}`);

  for (const jobId of jobIds) {
    queue.enqueue(jobId);
  }

  assert.equal(queue.size, 100);

  for (const jobId of jobIds) {
    assert.equal(queue.dequeue(), jobId);
  }

  assert.equal(queue.size, 0);

  console.log("Test 6 passed: Multiple jobs");
}

console.log("All Job Queue tests passed!");
