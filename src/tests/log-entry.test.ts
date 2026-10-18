import assert from "node:assert/strict";

import { createLogEntry, type LogLevel } from "../logging/log-entry.js";

// TEST 1 — Basic log entry
{
  const log = createLogEntry({
    runId: "run-123",
    level: "INFO",
    message: "Pipeline started",
  });

  assert.equal(log.runId, "run-123");
  assert.equal(log.level, "INFO");
  assert.equal(log.message, "Pipeline started");

  console.log("Test 1 passed: Basic log entry created");
}

// TEST 2 — Job-specific log entry
{
  const log = createLogEntry({
    runId: "run-123",
    jobId: "deploy",
    level: "ERROR",
    message: "Deployment failed",
  });

  assert.equal(log.jobId, "deploy");
  assert.equal(log.level, "ERROR");

  console.log("Test 2 passed: Job metadata preserved");
}

// TEST 3 — Valid ISO timestamp
{
  const before = Date.now();

  const log = createLogEntry({
    runId: "run-123",
    level: "INFO",
    message: "Build started",
  });

  const after = Date.now();
  const timestamp = Date.parse(log.timestamp);

  assert.ok(Number.isFinite(timestamp));
  assert.ok(timestamp >= before);
  assert.ok(timestamp <= after);

  assert.equal(new Date(timestamp).toISOString(), log.timestamp);

  console.log("Test 3 passed: ISO timestamp generated");
}

// TEST 4 — Invalid run IDs rejected
{
  for (const runId of ["", "   "]) {
    assert.throws(() =>
      createLogEntry({
        runId,
        level: "INFO",
        message: "Pipeline started",
      }),
    );
  }

  console.log("Test 4 passed: Invalid run IDs rejected");
}

// TEST 5 — Invalid messages rejected
{
  for (const message of ["", "   "]) {
    assert.throws(() =>
      createLogEntry({
        runId: "run-123",
        level: "ERROR",
        message,
      }),
    );
  }

  console.log("Test 5 passed: Invalid messages rejected");
}

// TEST 6 — Valid levels accepted, invalid rejected
{
  const levels: LogLevel[] = ["INFO", "WARN", "ERROR"];

  for (const level of levels) {
    const log = createLogEntry({
      runId: "run-123",
      level,
      message: "Test message",
    });

    assert.equal(log.level, level);
  }

  assert.throws(() =>
    createLogEntry({
      runId: "run-123",
      level: "DEBUG" as LogLevel,
      message: "Invalid level",
    }),
  );

  console.log("Test 6 passed: Log levels validated");
}

// TEST 7 — Input remains unchanged
{
  const input = {
    runId: "run-123",
    jobId: "build",
    level: "INFO" as const,
    message: "Build completed",
  };

  const original = { ...input };

  const log = createLogEntry(input);

  assert.deepEqual(input, original);
  assert.notEqual(log, input);

  console.log("Test 7 passed: Input not mutated");
}

console.log("All Log Entry tests passed!");
