import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { deployAndCheckHealth } from "../health/deployment-health.js";
import type { EnvironmentHealthConfig } from "../health/environment-health.js";

let applicationReady = false;
let healthRequests = 0;
let flakyRequests = 0;
let prodRequests = 0;

const server = createServer((req, res) => {
  switch (req.url) {
    case "/ready":
      healthRequests++;
      res.writeHead(applicationReady ? 200 : 503);
      res.end(applicationReady ? "Ready" : "Unavailable");
      return;

    case "/unhealthy":
      healthRequests++;
      res.writeHead(503);
      res.end("Unavailable");
      return;

    case "/flaky":
      flakyRequests++;
      res.writeHead(flakyRequests >= 3 ? 200 : 503);
      res.end();
      return;

    case "/prod":
      prodRequests++;
      res.writeHead(204);
      res.end();
      return;

    default:
      res.writeHead(404);
      res.end();
  }
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}`;

try {
  // TEST 1 — Deployment happens before health check
  {
    applicationReady = false;

    let deploymentFinished = false;

    const result = await deployAndCheckHealth(
      async () => {
        applicationReady = true;
        deploymentFinished = true;
      },
      "TEST",
      {
        test: { healthUrl: `${base}/ready` },
      },
      { retries: 0 },
    );

    assert.equal(deploymentFinished, true);
    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 200);
    assert.equal(healthRequests, 1);

    console.log("Test 1 passed: Health checked after deployment");
  }

  // TEST 2 — Unhealthy deployment is detected
  {
    let deployed = false;

    const result = await deployAndCheckHealth(
      async () => {
        deployed = true;
      },
      "TEST",
      {
        test: { healthUrl: `${base}/unhealthy` },
      },
      { retries: 0 },
    );

    assert.equal(deployed, true);
    assert.equal(result.healthy, false);
    assert.equal(result.statusCode, 503);

    console.log("Test 2 passed: Unhealthy deployment detected");
  }

  // TEST 3 — Health retries are respected
  {
    flakyRequests = 0;

    const result = await deployAndCheckHealth(
      async () => {},
      "TEST",
      {
        test: { healthUrl: `${base}/flaky` },
      },
      {
        retries: 2,
        delayMs: 10,
        timeoutMs: 1000,
      },
    );

    assert.equal(result.healthy, true);
    assert.equal(flakyRequests, 3);

    console.log("Test 3 passed: Post-deployment retries work");
  }

  // TEST 4 — Failed deployment skips health check
  {
    const previousRequests = healthRequests;

    await assert.rejects(
      () =>
        deployAndCheckHealth(
          async () => {
            throw new Error("Deployment failed");
          },
          "TEST",
          {
            test: { healthUrl: `${base}/ready` },
          },
        ),
      /Deployment failed/,
    );

    assert.equal(healthRequests, previousRequests);

    console.log("Test 4 passed: Failed deployment skips health check");
  }

  // TEST 5 — PROD environment is selected
  {
    const configs: EnvironmentHealthConfig = {
      test: { healthUrl: `${base}/ready` },
      prod: { healthUrl: `${base}/prod` },
    };

    const result = await deployAndCheckHealth(async () => {}, "PROD", configs, {
      retries: 0,
    });

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 204);
    assert.equal(prodRequests, 1);

    console.log("Test 5 passed: Production health endpoint selected");
  }

  // TEST 6 — Missing health configuration is rejected
  {
    await assert.rejects(() =>
      deployAndCheckHealth(
        async () => {},
        "TEST",
        { test: {} },
        { retries: 0 },
      ),
    );

    console.log("Test 6 passed: Missing health configuration rejected");
  }

  console.log("All Post-Deployment Health tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
