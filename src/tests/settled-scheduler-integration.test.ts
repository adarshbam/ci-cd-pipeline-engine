import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

type EngineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

async function waitUntil(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }

  throw new Error(`Timed out waiting for: ${description}`);
}

// TEST 1 — Fast failure must not finalize the pipeline
// while another independent job is still running.
{
  const workflow: Workflow = {
    name: "settled-scheduler-failure",
    webhook: { url: "/test/settled-failure" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Fail build", run: "exit 1" }],
      },
      test: {
        steps: [
          {
            name: "Slow independent test",
            run: 'node -e "setTimeout(() => process.exit(0), 1500)"',
          },
        ],
      },
      deploy: {
        needs: ["build"],
        steps: [{ name: "Deploy", run: "echo deployed" }],
      },
    },
  };

  const engine = new PipelineEngine(workflow);
  const run: EngineRun = await engine.run();

  await waitUntil(() => run.jobs.build?.status === "FAILED", "build failure");

  assert.equal(
    run.status,
    "RUNNING",
    "Pipeline finalized before the independent job settled",
  );

  assert.equal(
    run.jobs.test?.status,
    "RUNNING",
    "Independent job was not still running",
  );

  console.log("Test 1 passed: Pipeline waits after first failure");

  await waitUntil(() => run.status === "FAILED", "pipeline finalization");

  assert.equal(run.jobs.build?.status, "FAILED");
  assert.equal(run.jobs.test?.status, "SUCCESS");
  assert.equal(run.jobs.deploy?.status, "SKIPPED");

  console.log("Test 2 passed: Final job states remain correct");
}

// TEST 3 — Multiple failures don't prevent independent
// successful jobs from finishing.
{
  const workflow: Workflow = {
    name: "settled-multiple-failures",
    webhook: { url: "/test/settled-multiple" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build fails", run: "exit 1" }],
      },
      lint: {
        steps: [{ name: "Lint fails", run: "exit 2" }],
      },
      test: {
        steps: [{ name: "Tests pass", run: "echo passed" }],
      },
      deploy: {
        needs: ["build", "test"],
        steps: [{ name: "Deploy", run: "echo deployed" }],
      },
    },
  };

  const engine = new PipelineEngine(workflow);
  const run = await engine.run();

  await waitUntil(() => run.status === "FAILED", "multiple-failure pipeline");

  assert.equal(run.jobs.build?.status, "FAILED");
  assert.equal(run.jobs.lint?.status, "FAILED");
  assert.equal(run.jobs.test?.status, "SUCCESS");
  assert.equal(run.jobs.deploy?.status, "SKIPPED");

  console.log("Test 3 passed: Multiple failures settle correctly");
}

console.log("All Settled Scheduler Integration tests passed!");
