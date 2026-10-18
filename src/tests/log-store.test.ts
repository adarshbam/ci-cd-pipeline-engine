import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createLogEntry,
  type ExecutionLogEntry,
} from "../logging/log-entry.js";

import { appendLogEntry } from "../logging/log-store.js";

// Use a temporary directory to avoid modifying
// the application's actual runtime logs.
const root = await mkdtemp(join(tmpdir(), "ci-log-store-test-"));

const logDirectory = join(root, "logs");

async function readEntries(runId: string): Promise<ExecutionLogEntry[]> {
  const content = await readFile(join(logDirectory, `${runId}.jsonl`), "utf8");

  return content
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ExecutionLogEntry);
}

try {
  // TEST 1 — Directory and file created automatically
  {
    const entry = createLogEntry({
      runId: "run-001",
      level: "INFO",
      message: "Pipeline started",
    });

    await appendLogEntry(entry, logDirectory);

    const entries = await readEntries("run-001");

    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], entry);

    console.log("Test 1 passed: Log directory and file created");
  }

  // TEST 2 — Multiple entries are appended in order
  {
    const messages = ["Build started", "Build running", "Build completed"];

    for (const message of messages) {
      await appendLogEntry(
        createLogEntry({
          runId: "run-002",
          level: "INFO",
          message,
        }),
        logDirectory,
      );
    }

    const entries = await readEntries("run-002");

    assert.deepEqual(
      entries.map((entry) => entry.message),
      messages,
    );

    console.log("Test 2 passed: Entries appended in order");
  }

  // TEST 3 — Different pipeline runs are isolated
  {
    await appendLogEntry(
      createLogEntry({
        runId: "run-003",
        level: "INFO",
        message: "Run three",
      }),
      logDirectory,
    );

    await appendLogEntry(
      createLogEntry({
        runId: "run-004",
        level: "ERROR",
        message: "Run four",
      }),
      logDirectory,
    );

    const first = await readEntries("run-003");
    const second = await readEntries("run-004");

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);

    assert.equal(first[0]?.message, "Run three");
    assert.equal(second[0]?.message, "Run four");

    const files = await readdir(logDirectory);

    assert.ok(files.includes("run-003.jsonl"));
    assert.ok(files.includes("run-004.jsonl"));

    console.log("Test 3 passed: Pipeline logs are isolated");
  }

  // TEST 4 — Job metadata and special characters
  {
    const entry = createLogEntry({
      runId: "run-005",
      jobId: "deploy",
      level: "ERROR",
      message: 'Deploy failed:\n"Connection refused"',
    });

    await appendLogEntry(entry, logDirectory);

    const entries = await readEntries("run-005");

    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], entry);

    // Even messages containing newlines must be
    // stored as exactly one physical JSONL line.
    const raw = await readFile(join(logDirectory, "run-005.jsonl"), "utf8");

    assert.equal(raw.trimEnd().split("\n").length, 1);

    console.log("Test 4 passed: Structured metadata preserved");
  }

  // TEST 5 — Unsafe run IDs rejected
  {
    const unsafeIds = [
      "../escape",
      "../../secret",
      "folder/escape",
      "..\\escape",
      "run with spaces",
    ];

    for (const runId of unsafeIds) {
      const entry = createLogEntry({
        runId,
        level: "INFO",
        message: "Should not be written",
      });

      await assert.rejects(appendLogEntry(entry, logDirectory));
    }

    const files = await readdir(logDirectory);

    assert.ok(files.every((file) => file.endsWith(".jsonl")));

    console.log("Test 5 passed: Unsafe run IDs rejected");
  }

  // TEST 6 — Existing logs survive later writes
  {
    const firstEntry = createLogEntry({
      runId: "run-006",
      level: "INFO",
      message: "First event",
    });

    await appendLogEntry(firstEntry, logDirectory);

    const secondEntry = createLogEntry({
      runId: "run-006",
      level: "WARN",
      message: "Second event",
    });

    await appendLogEntry(secondEntry, logDirectory);

    const entries = await readEntries("run-006");

    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0], firstEntry);
    assert.deepEqual(entries[1], secondEntry);

    console.log("Test 6 passed: Existing log history preserved");
  }

  console.log("All Log Store tests passed!");
} finally {
  await rm(root, {
    recursive: true,
    force: true,
  });
}
