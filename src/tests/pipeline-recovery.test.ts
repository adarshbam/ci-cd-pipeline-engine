import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

type EngineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

async function waitForCompletion(run: EngineRun): Promise<void> {
  const deadline = Date.now() + 15000;

  while (run.status !== "SUCCESS" && run.status !== "FAILED") {
    if (Date.now() >= deadline) {
      throw new Error("Pipeline did not finish in time");
    }

    await sleep(25);
  }
}

const root = await mkdtemp(join(tmpdir(), "ci-pipeline-recovery-"));

try {
  const markerPath = join(root, "resource-ready.flag").replace(/\\/g, "/");

  // The command fails while the marker file is missing
  // and succeeds once we create it.
  const checkResource =
    `node -e "process.exit(` +
    `require('node:fs').existsSync(process.argv[1])` +
    ` ? 0 : 1)" "${markerPath}"`;

  const workflow: Workflow = {
    name: "pipeline-recovery",
    webhook: {
      url: "/test/pipeline-recovery",
    },
    trigger: {
      events: ["push"],
    },
    jobs: {
      prepare: {
        steps: [
          {
            name: "Check required resource",
            run: checkResource,
          },
        ],
      },
      audit: {
        steps: [
          {
            name: "Independent audit",
            run: "echo audit-ok",
          },
        ],
      },
      deploy: {
        needs: ["prepare"],
        steps: [
          {
            name: "Deploy",
            run: "echo deployed",
          },
        ],
      },
    },
  };

  const engine = new PipelineEngine(workflow);

  // TEST 1 — New pipeline starts in RUNNING state
  const first = await engine.run();

  assert.ok(first.id);
  assert.equal(first.pipelineId, workflow.name);
  assert.equal(first.status, "RUNNING");

  console.log("Test 1 passed: Initial pipeline state is RUNNING");

  // TEST 2 — Missing resource causes a failure
  await waitForCompletion(first);

  assert.equal(first.status, "FAILED");
  assert.equal(first.jobs.prepare?.status, "FAILED");
  assert.equal(first.jobs.audit?.status, "SUCCESS");
  assert.equal(first.jobs.deploy?.status, "SKIPPED");

  console.log("Test 2 passed: Failure states propagate correctly");

  // TEST 3 — Fix the resource and start a fresh run
  await writeFile(markerPath, "ready", "utf8");

  const second = await engine.run();

  assert.notEqual(second.id, first.id);

  await waitForCompletion(second);

  assert.equal(second.status, "SUCCESS");
  assert.equal(second.jobs.prepare?.status, "SUCCESS");
  assert.equal(second.jobs.audit?.status, "SUCCESS");
  assert.equal(second.jobs.deploy?.status, "SUCCESS");

  console.log("Test 3 passed: New pipeline succeeds after recovery");

  // TEST 4 — Failed run history remains unchanged
  assert.equal(engine.getRun(first.id), first);
  assert.equal(engine.getRun(second.id), second);

  assert.equal(first.status, "FAILED");
  assert.equal(first.jobs.prepare?.status, "FAILED");
  assert.equal(first.jobs.deploy?.status, "SKIPPED");

  console.log("Test 4 passed: Previous failed run remains unchanged");

  // TEST 5 — Multiple recovered runs remain independent
  const [third, fourth] = await Promise.all([engine.run(), engine.run()]);

  assert.notEqual(third.id, fourth.id);
  assert.notEqual(third.id, second.id);

  await Promise.all([waitForCompletion(third), waitForCompletion(fourth)]);

  for (const run of [third, fourth]) {
    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs.prepare?.status, "SUCCESS");
    assert.equal(run.jobs.audit?.status, "SUCCESS");
    assert.equal(run.jobs.deploy?.status, "SUCCESS");
  }

  console.log("Test 5 passed: Concurrent recovered runs remain independent");

  // TEST 6 — Finished runs have stable terminal states
  const runs = [first, second, third, fourth];

  for (const run of runs) {
    assert.ok(run.status === "SUCCESS" || run.status === "FAILED");

    assert.ok(
      Object.values(run.jobs).every(
        (job) => job.status !== "QUEUED" && job.status !== "RUNNING",
      ),
      "Finished pipeline contains unfinished jobs",
    );
  }

  assert.equal(engine.getRun("unknown-run-id"), undefined);

  await sleep(100);

  assert.deepEqual(
    runs.map((run) => run.status),
    ["FAILED", "SUCCESS", "SUCCESS", "SUCCESS"],
  );

  console.log("Test 6 passed: Terminal states remain stable");

  console.log("All Pipeline Recovery tests passed!");
} finally {
  await rm(root, {
    recursive: true,
    force: true,
  });
}
