import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

type EngineRun = Awaited<ReturnType<PipelineEngine["run"]>>;

let healthy = true;
let healthRequests = 0;

const server = createServer((req, res) => {
  healthRequests++;

  if (req.url !== "/health") {
    res.writeHead(404);
    res.end();
    return;
  }

  res.writeHead(healthy ? 200 : 503);
  res.end(healthy ? "Healthy" : "Unavailable");
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address() as AddressInfo;
const healthUrl = `http://127.0.0.1:${address.port}/health`;

function createWorkflow(
  options: {
    healthCheck?: boolean;
    failCommand?: boolean;
    includeHealthUrl?: boolean;
  } = {},
): Workflow {
  const {
    healthCheck = true,
    failCommand = false,
    includeHealthUrl = true,
  } = options;

  return {
    name: "deployment-job-health",
    webhook: {
      url: "/test/deployment-job-health",
    },
    trigger: {
      events: ["push"],
    },
    environments: {
      test: includeHealthUrl ? { healthUrl } : {},
    },
    jobs: {
      deploy: {
        healthCheck,
        steps: [
          {
            name: "Deploy",
            run: failCommand ? "exit 1" : "echo deployed",
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
      postdeploy: {
        needs: ["deploy"],
        steps: [
          {
            name: "Post-deployment verification",
            run: "echo postdeploy-ok",
          },
        ],
      },
    },
  } as Workflow;
}

async function waitForCompletion(run: EngineRun): Promise<void> {
  const deadline = Date.now() + 20000;

  while (run.status !== "SUCCESS" && run.status !== "FAILED") {
    if (Date.now() >= deadline) {
      throw new Error("Pipeline did not finish in time");
    }

    await sleep(25);
  }
}

try {
  // TEST 1 — Healthy deployment succeeds
  {
    healthy = true;
    const engine = new PipelineEngine(createWorkflow());

    const run = await engine.run("develop");
    await waitForCompletion(run);

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs.deploy?.status, "SUCCESS");
    assert.equal(run.jobs.postdeploy?.status, "SUCCESS");
    assert.equal(run.jobs.audit?.status, "SUCCESS");

    console.log("Test 1 passed: Healthy deployment succeeds");
  }

  // TEST 2 — Unhealthy deployment fails the pipeline
  {
    healthy = false;
    const engine = new PipelineEngine(createWorkflow());

    const run = await engine.run("develop");
    await waitForCompletion(run);

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs.deploy?.status, "FAILED");
    assert.equal(run.jobs.postdeploy?.status, "SKIPPED");
    assert.equal(run.jobs.audit?.status, "SUCCESS");

    console.log("Test 2 passed: Unhealthy deployment fails pipeline");
  }

  // TEST 3 — Failed deployment command skips health check
  {
    healthy = true;
    const before = healthRequests;

    const engine = new PipelineEngine(createWorkflow({ failCommand: true }));

    const run = await engine.run("develop");
    await waitForCompletion(run);

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs.deploy?.status, "FAILED");
    assert.equal(run.jobs.postdeploy?.status, "SKIPPED");
    assert.equal(healthRequests, before);

    console.log("Test 3 passed: Failed command skips health check");
  }

  // TEST 4 — Jobs without healthCheck remain compatible
  {
    healthy = false;
    const before = healthRequests;

    const engine = new PipelineEngine(createWorkflow({ healthCheck: false }));

    const run = await engine.run("develop");
    await waitForCompletion(run);

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs.deploy?.status, "SUCCESS");
    assert.equal(run.jobs.postdeploy?.status, "SUCCESS");
    assert.equal(healthRequests, before);

    console.log("Test 4 passed: Health verification is opt-in");
  }

  // TEST 5 — Missing health configuration fails job
  {
    healthy = true;

    const engine = new PipelineEngine(
      createWorkflow({ includeHealthUrl: false }),
    );

    const run = await engine.run("develop");
    await waitForCompletion(run);

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs.deploy?.status, "FAILED");
    assert.equal(run.jobs.postdeploy?.status, "SKIPPED");
    assert.equal(run.jobs.audit?.status, "SUCCESS");

    console.log("Test 5 passed: Missing health URL fails deployment");
  }

  // TEST 6 — New run recovers without changing old run
  {
    healthy = false;

    const engine = new PipelineEngine(createWorkflow());

    const first = await engine.run("develop");
    await waitForCompletion(first);

    assert.equal(first.status, "FAILED");

    healthy = true;

    const second = await engine.run("develop");
    await waitForCompletion(second);

    assert.notEqual(first.id, second.id);
    assert.equal(second.status, "SUCCESS");
    assert.equal(second.jobs.deploy?.status, "SUCCESS");
    assert.equal(second.jobs.postdeploy?.status, "SUCCESS");

    assert.equal(first.status, "FAILED");
    assert.equal(first.jobs.deploy?.status, "FAILED");
    assert.equal(engine.getRun(first.id), first);
    assert.equal(engine.getRun(second.id), second);

    console.log("Test 6 passed: New run recovers independently");
  }

  console.log("All Deployment Job Health tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
