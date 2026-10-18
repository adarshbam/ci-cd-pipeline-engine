import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import PipelineEngine from "../pipeline/pipeline-engine.js";
import type { Workflow } from "../workflow/workflow.js";

let healthy = true;
let healthRequests = 0;

const server = createServer((_req, res) => {
  healthRequests++;

  res.writeHead(healthy ? 200 : 503);
  res.end(healthy ? "Healthy" : "Unavailable");
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address() as AddressInfo;
const healthUrl = `http://127.0.0.1:${address.port}/health`;

const testDirectory = await mkdtemp(join(tmpdir(), "rollback-trigger-"));

// This command creates a marker file outside the
// temporary rollback workspace.
// It lets us verify the rollback actually executed.
const successfulRollbackCommand =
  "node -e \"require('node:fs').writeFileSync(process.env.ROLLBACK_MARKER_FILE, 'executed')\"";

const failedRollbackCommand =
  "node -e \"require('node:fs').writeFileSync(process.env.ROLLBACK_MARKER_FILE, 'attempted'); process.exit(1)\"";

function createWorkflow(
  name: string,
  options: {
    healthCheck?: boolean;
    includeRollback?: boolean;
    deploymentCommand?: string;
    rollbackCommand?: string;
  } = {},
): Workflow {
  const {
    healthCheck = true,
    includeRollback = true,
    deploymentCommand = "echo deployment-complete",
    rollbackCommand = successfulRollbackCommand,
  } = options;

  return {
    name,
    webhook: {
      url: `/test/${name}`,
    },
    trigger: {
      events: ["push"],
    },
    environments: {
      test: {
        healthUrl,
      },
    },
    jobs: {
      deploy: {
        healthCheck,
        ...(includeRollback
          ? {
              rollback: {
                steps: [
                  {
                    name: "Restore previous deployment",
                    run: rollbackCommand,
                  },
                ],
              },
            }
          : {}),
        steps: [
          {
            name: "Deploy application",
            run: deploymentCommand,
          },
        ],
      },

      audit: {
        steps: [
          {
            name: "Independent audit",
            run: "echo audit-complete",
          },
        ],
      },

      postdeploy: {
        needs: ["deploy"],
        steps: [
          {
            name: "Post-deployment task",
            run: "echo postdeploy-complete",
          },
        ],
      },
    },
  } as Workflow;
}

async function startAndWait(workflow: Workflow) {
  const engine = new PipelineEngine(workflow);
  const run = await engine.run("develop");

  const deadline = Date.now() + 20000;

  while (run.status !== "SUCCESS" && run.status !== "FAILED") {
    if (Date.now() >= deadline) {
      throw new Error("Pipeline did not finish");
    }

    await sleep(25);
  }

  return run;
}

function marker(name: string): string {
  const path = join(testDirectory, `${name}.txt`);

  process.env.ROLLBACK_MARKER_FILE = path;

  return path;
}

try {
  // TEST 1 — Healthy deployment skips rollback
  {
    healthy = true;
    const path = marker("healthy");

    const run = await startAndWait(createWorkflow("rollback-healthy"));

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs.deploy?.status, "SUCCESS");
    assert.equal(existsSync(path), false);

    console.log("Test 1 passed: Healthy deployment skips rollback");
  }

  // TEST 2 — Unhealthy deployment triggers rollback
  {
    healthy = false;
    const path = marker("unhealthy");

    const run = await startAndWait(createWorkflow("rollback-unhealthy"));

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs.deploy?.status, "FAILED");
    assert.equal(run.jobs.postdeploy?.status, "SKIPPED");
    assert.equal(run.jobs.audit?.status, "SUCCESS");

    assert.equal(existsSync(path), true, "Rollback command never executed");

    console.log("Test 2 passed: Unhealthy deployment triggers rollback");
  }

  // TEST 3 — Failed rollback keeps pipeline FAILED
  {
    healthy = false;
    const path = marker("rollback-fails");

    const run = await startAndWait(
      createWorkflow("rollback-fails", {
        rollbackCommand: failedRollbackCommand,
      }),
    );

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs.deploy?.status, "FAILED");

    assert.equal(existsSync(path), true, "Failed rollback was never attempted");

    console.log("Test 3 passed: Failed rollback preserves failure");
  }

  // TEST 4 — Failed deployment command skips rollback
  {
    healthy = true;
    const path = marker("command-fails");
    const before = healthRequests;

    const run = await startAndWait(
      createWorkflow("rollback-command-fails", {
        deploymentCommand: "exit 1",
      }),
    );

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs.deploy?.status, "FAILED");
    assert.equal(existsSync(path), false);
    assert.equal(healthRequests, before);

    console.log("Test 4 passed: Command failure skips rollback");
  }

  // TEST 5 — Missing rollback config remains compatible
  {
    healthy = false;
    const path = marker("no-rollback");

    const run = await startAndWait(
      createWorkflow("rollback-not-configured", {
        includeRollback: false,
      }),
    );

    assert.equal(run.status, "FAILED");
    assert.equal(run.jobs.deploy?.status, "FAILED");
    assert.equal(existsSync(path), false);

    console.log("Test 5 passed: Optional rollback remains compatible");
  }

  // TEST 6 — Health checks remain opt-in
  {
    healthy = false;
    const path = marker("opt-out");
    const before = healthRequests;

    const run = await startAndWait(
      createWorkflow("rollback-health-disabled", {
        healthCheck: false,
      }),
    );

    assert.equal(run.status, "SUCCESS");
    assert.equal(run.jobs.deploy?.status, "SUCCESS");
    assert.equal(existsSync(path), false);
    assert.equal(healthRequests, before);

    console.log("Test 6 passed: Disabled health check skips rollback");
  }

  console.log("All Rollback Trigger tests passed!");
} finally {
  delete process.env.ROLLBACK_MARKER_FILE;

  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  await rm(testDirectory, {
    recursive: true,
    force: true,
  });
}
