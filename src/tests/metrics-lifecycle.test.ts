import assert from "node:assert/strict";
import { MetricsCollector } from "../metrics/metrics-collector.js";

// TEST 1 — Empty collector has no active runs
{
  const collector = new MetricsCollector();

  assert.equal(collector.getActiveRunCount(), 0);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageDurationMs: 0,
  });

  console.log("Test 1 passed: Empty active runs");
}

// TEST 2 — Starting a run makes it active
{
  const collector = new MetricsCollector();

  collector.startRun("run-1", 1000);

  assert.equal(collector.getActiveRunCount(), 1);
  assert.equal(collector.getSnapshot().totalRuns, 0);

  console.log("Test 2 passed: Active run registered");
}

// TEST 3 — Completing a run removes it from active runs
{
  const collector = new MetricsCollector();

  collector.startRun("run-1", 1000);
  collector.startRun("run-2", 1200);

  assert.equal(collector.getActiveRunCount(), 2);

  collector.finishRun("run-1", "SUCCESS", 1500);

  assert.equal(collector.getActiveRunCount(), 1);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    averageDurationMs: 500,
  });

  console.log("Test 3 passed: Completed run removed");
}

// TEST 4 — Success, failure and average duration
{
  const collector = new MetricsCollector();

  collector.startRun("run-1", 1000);
  collector.startRun("run-2", 2000);

  collector.finishRun("run-1", "SUCCESS", 1400);
  collector.finishRun("run-2", "FAILED", 2600);

  assert.equal(collector.getActiveRunCount(), 0);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 2,
    successfulRuns: 1,
    failedRuns: 1,
    averageDurationMs: 500,
  });

  console.log("Test 4 passed: Durations calculated");
}

// TEST 5 — Duplicate starts and finishes are ignored
{
  const collector = new MetricsCollector();

  collector.startRun("run-1", 1000);
  collector.startRun("run-1", 5000);

  assert.equal(collector.getActiveRunCount(), 1);

  collector.finishRun("run-1", "SUCCESS", 1500);

  // This must not record the same run again.
  collector.finishRun("run-1", "FAILED", 9000);

  // A completed run must not become active again.
  collector.startRun("run-1", 10_000);

  assert.equal(collector.getActiveRunCount(), 0);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    averageDurationMs: 500,
  });

  console.log("Test 5 passed: Duplicates prevented");
}

// TEST 6 — Unknown runs and separate collectors
{
  const first = new MetricsCollector();
  const second = new MetricsCollector();

  // Finishing a run that never started must do nothing.
  first.finishRun("unknown", "FAILED", 1000);

  assert.equal(first.getSnapshot().totalRuns, 0);

  first.startRun("run-1", 100);
  second.startRun("run-2", 200);

  first.finishRun("run-1", "SUCCESS", 400);

  assert.equal(first.getActiveRunCount(), 0);
  assert.equal(second.getActiveRunCount(), 1);

  assert.equal(first.getSnapshot().totalRuns, 1);
  assert.equal(second.getSnapshot().totalRuns, 0);

  console.log("Test 6 passed: Collector isolation");
}

// TEST 7 — Timestamp zero is valid
{
  const collector = new MetricsCollector();

  collector.startRun("run-zero", 0);
  collector.finishRun("run-zero", "SUCCESS", 300);

  assert.equal(collector.getActiveRunCount(), 0);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    averageDurationMs: 300,
  });

  console.log("Test 7 passed: Zero timestamp handled");
}

// TEST 8 — Legacy completed runs cannot restart
{
  const collector = new MetricsCollector();

  collector.recordCompletedRun("old-run", "SUCCESS", 250);

  collector.startRun("old-run", 1000);

  assert.equal(collector.getActiveRunCount(), 0);

  collector.finishRun("old-run", "FAILED", 2000);

  assert.deepEqual(collector.getSnapshot(), {
    totalRuns: 1,
    successfulRuns: 1,
    failedRuns: 0,
    averageDurationMs: 250,
  });

  console.log("Test 8 passed: Legacy completed run protected");
}

console.log("All Metrics Lifecycle tests passed!");
