import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

const root = await mkdtemp(join(tmpdir(), "ci-concurrency-final-"));

const scriptPath = join(root, "job.cjs");
const logPath = join(root, "events.txt");

function shellPath(path: string): string {
  return path.replace(/\\/g, "/");
}

async function waitForRun(run: Awaited<ReturnType<PipelineEngine["run"]>>) {
  const deadline = Date.now() + 15000;

  while (
    run.status !== "SUCCESS" &&
    run.status !== "FAILED" &&
    Date.now() < deadline
  ) {
    await sleep(50);
  }

  assert.ok(
    run.status === "SUCCESS" || run.status === "FAILED",
    "Pipeline did not finish within 15 seconds",
  );

  return run;
}

try {
  // Every job writes its start and finish to one log.
  await writeFile(
    scriptPath,
    `
const fs = require("node:fs");

const [logPath, name] = process.argv.slice(2);

fs.appendFileSync(logPath, "start:" + name + "\\n");

setTimeout(() => {
  fs.appendFileSync(logPath, "end:" + name + "\\n");
}, 350);
`,
    "utf8",
  );

  const command = (name: string) =>
    `node "${shellPath(scriptPath)}" "${shellPath(logPath)}" ${name}`;

  const workflow: Workflow = {
    name: "concurrency-final",
    webhook: { url: "/test/concurrency-final" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: command("build") }],
      },
      test: {
        steps: [{ name: "Test", run: command("test") }],
      },
      lint: {
        steps: [{ name: "Lint", run: command("lint") }],
      },
      deploy: {
        needs: ["build", "test", "lint"],
        steps: [{ name: "Deploy", run: command("deploy") }],
      },
    },
  };

  const engine = new PipelineEngine(workflow);
  const run = await waitForRun(await engine.run());

  // TEST 1 — All jobs completed
  assert.equal(run.status, "SUCCESS");

  for (const jobId of Object.keys(workflow.jobs)) {
    assert.equal(run.jobs[jobId]?.status, "SUCCESS");
  }

  console.log("Test 1 passed: All jobs completed");

  const contents = await readFile(logPath, "utf8");
  const events = contents.trim().split(/\r?\n/);

  // TEST 2 — Every job starts and finishes once
  for (const jobId of Object.keys(workflow.jobs)) {
    assert.equal(events.filter((e) => e === `start:${jobId}`).length, 1);

    assert.equal(events.filter((e) => e === `end:${jobId}`).length, 1);
  }

  console.log("Test 2 passed: No duplicate executions");

  // TEST 3 — Never more than two jobs running
  let active = 0;
  let maximumObserved = 0;

  for (const event of events) {
    if (event.startsWith("start:")) {
      active++;
      maximumObserved = Math.max(maximumObserved, active);
    } else if (event.startsWith("end:")) {
      active--;
    }

    assert.ok(active >= 0, "Invalid execution event order");
    assert.ok(active <= 2, "Concurrency limit exceeded");
  }

  assert.equal(active, 0);
  assert.equal(maximumObserved, 2, "Independent jobs did not overlap");

  console.log("Test 3 passed: Concurrency limit enforced");

  // TEST 4 — Deploy starts only after prerequisites finish
  const deployStart = events.indexOf("start:deploy");

  for (const dependency of ["build", "test", "lint"]) {
    const dependencyEnd = events.indexOf(`end:${dependency}`);

    assert.ok(
      dependencyEnd < deployStart,
      `Deploy started before ${dependency} finished`,
    );
  }

  console.log("Test 4 passed: Dependency ordering preserved");

  // TEST 5 — Independent pipeline runs
  const independentWorkflow: Workflow = {
    name: "independent-concurrency",
    webhook: { url: "/test/independent-concurrency" },
    trigger: { events: ["push"] },
    jobs: {
      build: {
        steps: [{ name: "Build", run: "echo build-ok" }],
      },
      test: {
        steps: [{ name: "Test", run: "echo test-ok" }],
      },
    },
  };

  const independentEngine = new PipelineEngine(independentWorkflow);

  const [first, second] = await Promise.all([
    independentEngine.run(),
    independentEngine.run(),
  ]);

  assert.notEqual(first.id, second.id);

  await Promise.all([waitForRun(first), waitForRun(second)]);

  assert.equal(first.status, "SUCCESS");
  assert.equal(second.status, "SUCCESS");

  console.log("Test 5 passed: Independent runs remain isolated");

  console.log("All Final Concurrency tests passed!");
} finally {
  await rm(root, { recursive: true, force: true });
}
