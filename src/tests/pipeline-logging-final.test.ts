import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import { readLogEntries } from "../logging/log-reader.js";
import type { ExecutionLogEntry } from "../logging/log-entry.js";
import type { Workflow } from "../workflow/workflow.js";

const createdRunIds: string[] = [];

function createWorkflow(name: string, failBuild = false): Workflow {
  return {
    name,
    webhook: { url: `/test/${name}` },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [
          {
            name: "Build",
            run: failBuild ? "exit 1" : "echo build-ok",
          },
        ],
      },
      audit: {
        steps: [
          {
            name: "Audit",
            run: "echo audit-ok",
          },
        ],
      },
      package: {
        needs: ["build"],
        steps: [
          {
            name: "Package",
            run: "echo package-ok",
          },
        ],
      },
    },
  } as Workflow;
}

function createCyclicWorkflow(name: string): Workflow {
  return {
    name,
    webhook: { url: `/test/${name}` },
    trigger: { events: ["push"] },
    jobs: {
      first: {
        needs: ["second"],
        steps: [{ name: "First", run: "echo first" }],
      },
      second: {
        needs: ["first"],
        steps: [{ name: "Second", run: "echo second" }],
      },
    },
  } as Workflow;
}

function pipelineLogs(logs: ExecutionLogEntry[]) {
  return logs.filter((entry) => entry.jobId === undefined);
}

function terminalLogs(logs: ExecutionLogEntry[]) {
  return pipelineLogs(logs).filter(
    (entry) =>
      entry.message === "Pipeline completed successfully" ||
      entry.message.startsWith("Pipeline failed"),
  );
}

async function startAndWait(workflow: Workflow) {
  const engine = new PipelineEngine(workflow);
  const run = await engine.run("develop");

  createdRunIds.push(run.id);

  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const logs = await readLogEntries(run.id);

    const finished = run.status === "SUCCESS" || run.status === "FAILED";

    if (finished && terminalLogs(logs).length > 0) {
      // Allow any final asynchronous log write to settle.
      await sleep(30);

      return {
        run,
        logs: await readLogEntries(run.id),
      };
    }

    await sleep(40);
  }

  throw new Error(`Pipeline ${run.id} did not finish logging in time`);
}

try {
  // TEST 1 — Successful pipeline lifecycle
  {
    const { run, logs } = await startAndWait(
      createWorkflow("pipeline-log-success"),
    );

    assert.equal(run.status, "SUCCESS");

    const entries = pipelineLogs(logs);

    assert.equal(entries.length, 2);

    assert.deepEqual(
      entries.map((entry) => entry.message),
      ["Pipeline started", "Pipeline completed successfully"],
    );

    assert.deepEqual(
      entries.map((entry) => entry.level),
      ["INFO", "INFO"],
    );

    console.log("Test 1 passed: Successful pipeline lifecycle logged");
  }

  // TEST 2 — Failed pipeline lifecycle
  {
    const { run, logs } = await startAndWait(
      createWorkflow("pipeline-log-failure", true),
    );

    assert.equal(run.status, "FAILED");

    const entries = pipelineLogs(logs);

    assert.equal(entries.length, 2);

    assert.equal(entries[0]?.message, "Pipeline started");

    assert.equal(entries[0]?.level, "INFO");

    assert.match(entries[1]?.message ?? "", /^Pipeline failed/);

    assert.equal(entries[1]?.level, "ERROR");

    console.log("Test 2 passed: Failed pipeline lifecycle logged");
  }

  // TEST 3 — Failure preserves individual job logs
  {
    const { run, logs } = await startAndWait(
      createWorkflow("pipeline-log-job-details", true),
    );

    assert.equal(run.status, "FAILED");

    const buildLogs = logs.filter((entry) => entry.jobId === "build");

    assert.equal(buildLogs.length, 2);

    assert.equal(buildLogs[0]?.message, "Job started");

    assert.match(buildLogs[1]?.message ?? "", /^Job failed:/);

    assert.equal(run.jobs.build?.status, "FAILED");

    assert.equal(run.jobs.package?.status, "SKIPPED");

    assert.equal(run.jobs.audit?.status, "SUCCESS");

    console.log("Test 3 passed: Job failures and dependencies preserved");
  }

  // TEST 4 — Dependency cycles produce a terminal log
  {
    const { run, logs } = await startAndWait(
      createCyclicWorkflow("pipeline-log-cycle"),
    );

    assert.equal(run.status, "FAILED");

    const entries = pipelineLogs(logs);

    assert.equal(entries[0]?.message, "Pipeline started");

    assert.equal(terminalLogs(logs).length, 1);

    assert.match(terminalLogs(logs)[0]?.message ?? "", /^Pipeline failed/);

    console.log("Test 4 passed: Dependency cycles logged as failures");
  }

  // TEST 5 — Independent concurrent runs
  {
    const [first, second] = await Promise.all([
      startAndWait(createWorkflow("pipeline-log-parallel-a")),
      startAndWait(createWorkflow("pipeline-log-parallel-b", true)),
    ]);

    assert.notEqual(first.run.id, second.run.id);

    assert.equal(first.run.status, "SUCCESS");
    assert.equal(second.run.status, "FAILED");

    assert.ok(first.logs.every((entry) => entry.runId === first.run.id));

    assert.ok(second.logs.every((entry) => entry.runId === second.run.id));

    assert.equal(terminalLogs(first.logs).length, 1);

    assert.equal(terminalLogs(second.logs).length, 1);

    console.log("Test 5 passed: Concurrent pipeline logs isolated");
  }

  // TEST 6 — Pipeline start and finish logged only once
  {
    const { run, logs } = await startAndWait(
      createWorkflow("pipeline-log-no-duplicates"),
    );

    assert.equal(run.status, "SUCCESS");

    assert.equal(
      pipelineLogs(logs).filter((entry) => entry.message === "Pipeline started")
        .length,
      1,
    );

    assert.equal(terminalLogs(logs).length, 1);

    assert.equal(pipelineLogs(logs)[0]?.message, "Pipeline started");

    assert.equal(
      pipelineLogs(logs).at(-1)?.message,
      "Pipeline completed successfully",
    );

    console.log("Test 6 passed: No duplicate lifecycle events");
  }

  console.log("All Final Pipeline Logging tests passed!");
} finally {
  for (const runId of createdRunIds) {
    await rm(join("runtime", "logs", `${runId}.jsonl`), { force: true });
  }
}
