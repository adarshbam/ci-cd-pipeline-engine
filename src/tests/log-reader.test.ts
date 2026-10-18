import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createLogEntry,
  type ExecutionLogEntry,
} from "../logging/log-entry.js";
import { appendLogEntry } from "../logging/log-store.js";
import { readLogEntries } from "../logging/log-reader.js";

const root = await mkdtemp(join(tmpdir(), "ci-log-reader-test-"));

const directory = join(root, "logs");

// ----------------------------------------------------
// Test helpers
// ----------------------------------------------------

async function writeLog(
  runId: string,
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  jobId?: string,
): Promise<ExecutionLogEntry> {
  const entry = createLogEntry({
    runId,
    level,
    message,
    ...(jobId !== undefined ? { jobId } : {}),
  });

  await appendLogEntry(entry, directory);

  return entry;
}

try {
  // TEST 1 — Read all entries in original order
  {
    const first = await writeLog("run-001", "INFO", "Pipeline started");

    const second = await writeLog("run-001", "WARN", "Build warning", "build");

    const third = await writeLog(
      "run-001",
      "ERROR",
      "Deployment failed",
      "deploy",
    );

    const logs = await readLogEntries("run-001", {}, directory);

    assert.deepEqual(logs, [first, second, third]);

    console.log("Test 1 passed: Entries read in original order");
  }

  // TEST 2 — Filter by log level
  {
    await writeLog("run-002", "INFO", "Build started");

    await writeLog("run-002", "ERROR", "Build failed");

    await writeLog("run-002", "WARN", "Retrying");

    await writeLog("run-002", "ERROR", "Retry failed");

    const errors = await readLogEntries(
      "run-002",
      { level: "ERROR" },
      directory,
    );

    assert.deepEqual(
      errors.map((entry) => entry.message),
      ["Build failed", "Retry failed"],
    );

    assert.ok(errors.every((entry) => entry.level === "ERROR"));

    console.log("Test 2 passed: Logs filtered by level");
  }

  // TEST 3 — Filter by job ID
  {
    await writeLog("run-003", "INFO", "Build started", "build");

    await writeLog("run-003", "INFO", "Deploy started", "deploy");

    await writeLog("run-003", "INFO", "Build completed", "build");

    const logs = await readLogEntries("run-003", { jobId: "build" }, directory);

    assert.deepEqual(
      logs.map((entry) => entry.message),
      ["Build started", "Build completed"],
    );

    console.log("Test 3 passed: Logs filtered by job ID");
  }

  // TEST 4 — Combine level and job filters
  {
    await writeLog("run-004", "INFO", "Deploy started", "deploy");

    await writeLog("run-004", "ERROR", "Build failed", "build");

    await writeLog("run-004", "ERROR", "Deploy failed", "deploy");

    await writeLog("run-004", "WARN", "Deploy warning", "deploy");

    const logs = await readLogEntries(
      "run-004",
      {
        level: "ERROR",
        jobId: "deploy",
      },
      directory,
    );

    assert.equal(logs.length, 1);

    assert.equal(logs[0]?.message, "Deploy failed");

    console.log("Test 4 passed: Combined filters applied");
  }

  // TEST 5 — Missing files return an empty array
  {
    const logs = await readLogEntries("nonexistent-run", {}, directory);

    assert.deepEqual(logs, []);

    console.log("Test 5 passed: Missing run returns empty logs");
  }

  // TEST 6 — Different pipeline runs remain isolated
  {
    await writeLog("run-006", "INFO", "First pipeline");

    await writeLog("run-007", "ERROR", "Second pipeline");

    const first = await readLogEntries("run-006", {}, directory);

    const second = await readLogEntries("run-007", {}, directory);

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);

    assert.equal(first[0]?.message, "First pipeline");

    assert.equal(second[0]?.message, "Second pipeline");

    console.log("Test 6 passed: Pipeline logs remain isolated");
  }

  // TEST 7 — Unsafe run IDs are rejected
  {
    const unsafeIds = [
      "../secret",
      "../../other",
      "folder/run",
      "..\\escape",
      "run with spaces",
      "",
    ];

    for (const runId of unsafeIds) {
      await assert.rejects(readLogEntries(runId, {}, directory));
    }

    console.log("Test 7 passed: Unsafe run IDs rejected");
  }

  // TEST 8 — Corrupted log files are not ignored
  {
    await writeLog("run-008", "INFO", "Valid entry");

    await appendFile(
      join(directory, "run-008.jsonl"),
      "{invalid json}\n",
      "utf8",
    );

    await assert.rejects(readLogEntries("run-008", {}, directory), SyntaxError);

    console.log("Test 8 passed: Corrupted JSONL detected");
  }

  console.log("All Log Reader tests passed!");
} finally {
  await rm(root, {
    recursive: true,
    force: true,
  });
}
