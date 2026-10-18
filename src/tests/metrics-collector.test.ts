import assert from "node:assert/strict";
import { MetricsCollector } from "../metrics/metrics-collector.js";

// TEST 1 — Empty collector
{
  const collector = new MetricsCollector();

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageDurationMs: 0,
  });

  console.log("Test 1 passed: Empty metrics");
}

// TEST 2 — Successful pipeline
{
  const collector = new MetricsCollector();

  collector.recordCompletedRun("run-1", "SUCCESS", 200);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    averageDurationMs: 200,
  });

  console.log("Test 2 passed: Success recorded");
}

// TEST 3 — Failed pipeline
{
  const collector = new MetricsCollector();

  collector.recordCompletedRun("run-1", "FAILED", 500);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 1,
    successfulRuns: 0,
    failedRuns: 1,
    averageDurationMs: 500,
  });

  console.log("Test 3 passed: Failure recorded");
}

// TEST 4 — Average execution duration
{
  const collector = new MetricsCollector();

  collector.recordCompletedRun("run-1", "SUCCESS", 100);
  collector.recordCompletedRun("run-2", "FAILED", 200);
  collector.recordCompletedRun("run-3", "SUCCESS", 300);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 3,
    successfulRuns: 2,
    failedRuns: 1,
    averageDurationMs: 200,
  });

  console.log("Test 4 passed: Average duration calculated");
}

// TEST 5 — Duplicate run IDs are not counted twice
{
  const collector = new MetricsCollector();

  collector.recordCompletedRun("run-1", "SUCCESS", 100);
  collector.recordCompletedRun("run-1", "FAILED", 900);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    averageDurationMs: 100,
  });

  console.log("Test 5 passed: Duplicate run prevented");
}

// TEST 6 — Separate collectors remain independent
{
  const first = new MetricsCollector();
  const second = new MetricsCollector();

  first.recordCompletedRun("run-1", "SUCCESS", 100);
  second.recordCompletedRun("run-1", "FAILED", 500);

  assert.equal(first.getSnapshot().successfulRuns, 1);
  assert.equal(first.getSnapshot().failedRuns, 0);

  assert.equal(second.getSnapshot().successfulRuns, 0);
  assert.equal(second.getSnapshot().failedRuns, 1);

  console.log("Test 6 passed: Metrics remain isolated");
}

console.log("All Metrics Collector tests passed!");
