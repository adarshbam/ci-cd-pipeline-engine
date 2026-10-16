import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const root = await mkdtemp(join(tmpdir(), "ci-parallel-"));

const shellPath = (path: string) => path.replace(/\\/g, "/");

const scriptPath = join(root, "barrier.cjs");
const markerPath = join(root, "started.txt");

async function waitForPipeline(engine: PipelineEngine) {
  const run = await engine.run();
  const deadline = Date.now() + 10_000;

  while (
    run.status !== "SUCCESS" &&
    run.status !== "FAILED" &&
    Date.now() < deadline
  ) {
    await sleep(50);
  }

  assert.ok(
    run.status === "SUCCESS" || run.status === "FAILED",
    "Pipeline did not finish in time",
  );

  return run;
}

try {
  // Both jobs must start before either can finish.
  await writeFile(
    scriptPath,
    `
const fs = require("node:fs");

const [markerPath, jobName] = process.argv.slice(2);

fs.appendFileSync(markerPath, jobName + "\\n");

const started = Date.now();

const interval = setInterval(() => {
  const content = fs.readFileSync(markerPath, "utf8");
  const jobs = content.split(/\\r?\\n/);

  if (jobs.includes("A") && jobs.includes("B")) {
    clearInterval(interval);
    process.exit(0);
  }

  if (Date.now() - started > 4000) {
    clearInterval(interval);
    process.exit(1);
  }
}, 25);
`,
    "utf8",
  );

  const command = (name: string) =>
    `node "${shellPath(scriptPath)}" "${shellPath(markerPath)}" ${name}`;

  // TEST 1 — Independent jobs execute concurrently.
  const workflow: Workflow = {
    name: "parallel-test",
    webhook: { url: "/test/parallel" },
    trigger: { events: ["push"] },
    jobs: {
      a: {
        steps: [{ name: "Job A", run: command("A") }],
      },
      b: {
        steps: [{ name: "Job B", run: command("B") }],
      },
      deploy: {
        needs: ["a", "b"],
        steps: [{ name: "Deploy", run: "echo deployed" }],
      },
    },
  };

  const engine = new PipelineEngine(workflow);
  const run = await waitForPipeline(engine);

  assert.equal(run.status, "SUCCESS");
  assert.equal(run.jobs.a?.status, "SUCCESS");
  assert.equal(run.jobs.b?.status, "SUCCESS");

  console.log("Test 1 passed: Independent jobs execute concurrently");

  // TEST 2 — Dependent job waits for both.
  assert.equal(run.jobs.deploy?.status, "SUCCESS");

  console.log("Test 2 passed: Dependent job executes afterward");

  // TEST 3 — One failed job skips its dependent job,
  // while another independent job can still succeed.
  const failureWorkflow: Workflow = {
    name: "parallel-failure-test",
    webhook: { url: "/test/parallel-failure" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Fail", run: "exit 1" }],
      },
      lint: {
        steps: [{ name: "Lint", run: "echo lint-ok" }],
      },
      deploy: {
        needs: ["build"],
        steps: [{ name: "Deploy", run: "echo deploy" }],
      },
    },
  };

  const failureEngine = new PipelineEngine(failureWorkflow);
  const failed = await waitForPipeline(failureEngine);

  assert.equal(failed.status, "FAILED");
  assert.equal(failed.jobs.build?.status, "FAILED");
  assert.equal(failed.jobs.lint?.status, "SUCCESS");
  assert.equal(failed.jobs.deploy?.status, "SKIPPED");

  console.log("Test 3 passed: Failure does not prevent independent jobs");

  console.log("All Parallel Pipeline tests passed!");
} finally {
  await rm(root, { recursive: true, force: true });
}
