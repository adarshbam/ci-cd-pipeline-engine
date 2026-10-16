import assert from "node:assert/strict";
import { mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

type EngineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

async function waitForRun(run: EngineRun) {
  const deadline = Date.now() + 15000;

  while (run.status !== "SUCCESS" && run.status !== "FAILED") {
    if (Date.now() >= deadline) {
      throw new Error("Pipeline did not finish in time");
    }

    await sleep(25);
  }

  return run;
}

const root = await mkdtemp(join(tmpdir(), "ci-concurrent-failures-"));

try {
  const markerPath = join(root, "deploy-executed.txt").replace(/\\/g, "/");

  const workflow: Workflow = {
    name: "concurrent-failure-robustness",
    webhook: {
      url: "/test/concurrent-failures",
    },
    trigger: {
      events: ["push"],
    },
    jobs: {
      build: {
        steps: [{ name: "Build fails", run: "exit 1" }],
      },

      lint: {
        steps: [{ name: "Lint fails", run: "exit 2" }],
      },

      docs: {
        steps: [
          {
            name: "Generate docs",
            run: "echo docs-success",
          },
        ],
      },

      package: {
        needs: ["docs"],
        steps: [
          {
            name: "Package",
            run: "echo package-success",
          },
        ],
      },

      deploy: {
        needs: ["build", "package"],
        steps: [
          {
            name: "Should never execute",
            run:
              `node -e "require('node:fs')` +
              `.writeFileSync('${markerPath}', 'unexpected')"`,
          },
        ],
      },

      release: {
        needs: ["deploy"],
        steps: [
          {
            name: "Release",
            run: "echo should-not-run",
          },
        ],
      },
    },
  };

  const engine = new PipelineEngine(workflow);
  const run = await waitForRun(await engine.run());

  // TEST 1 — Multiple failures are recorded.
  assert.equal(run.status, "FAILED");
  assert.equal(run.jobs.build?.status, "FAILED");
  assert.equal(run.jobs.lint?.status, "FAILED");

  console.log("Test 1 passed: Multiple failures recorded");

  // TEST 2 — Independent job succeeds.
  assert.equal(run.jobs.docs?.status, "SUCCESS");

  console.log("Test 2 passed: Independent job survives failures");

  // TEST 3 — Successful dependency chain continues.
  assert.equal(run.jobs.package?.status, "SUCCESS");

  console.log("Test 3 passed: Successful dependency chain continues");

  // TEST 4 — Failed dependency skips descendants.
  assert.equal(run.jobs.deploy?.status, "SKIPPED");
  assert.equal(run.jobs.release?.status, "SKIPPED");

  console.log("Test 4 passed: Failure propagates through descendants");

  // TEST 5 — Skipped job must never execute commands.
  let markerExists = true;

  try {
    await access(markerPath);
  } catch {
    markerExists = false;
  }

  assert.equal(markerExists, false, "Skipped deploy job unexpectedly executed");

  console.log("Test 5 passed: Skipped job commands never executed");

  // TEST 6 — Two pipeline runs remain independent.
  const [first, second] = await Promise.all([engine.run(), engine.run()]);

  assert.notEqual(first.id, second.id);

  await Promise.all([waitForRun(first), waitForRun(second)]);

  assert.equal(first.status, "FAILED");
  assert.equal(second.status, "FAILED");

  for (const otherRun of [first, second]) {
    assert.equal(otherRun.jobs.build?.status, "FAILED");
    assert.equal(otherRun.jobs.lint?.status, "FAILED");
    assert.equal(otherRun.jobs.docs?.status, "SUCCESS");
    assert.equal(otherRun.jobs.package?.status, "SUCCESS");
    assert.equal(otherRun.jobs.deploy?.status, "SKIPPED");
    assert.equal(otherRun.jobs.release?.status, "SKIPPED");
  }

  console.log("Test 6 passed: Concurrent pipeline runs remain isolated");

  console.log("All Concurrent Failure Robustness tests passed!");
} finally {
  await rm(root, {
    recursive: true,
    force: true,
  });
}
