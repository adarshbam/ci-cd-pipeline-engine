import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  checkEnvironmentHealth,
  type EnvironmentHealthConfig,
} from "../health/environment-health.js";

let testRequests = 0;
let prodRequests = 0;
let flakyRequests = 0;

const server = createServer((req, res) => {
  switch (req.url) {
    case "/test-health":
      testRequests++;
      res.writeHead(200);
      res.end("TEST healthy");
      return;

    case "/prod-health":
      prodRequests++;
      res.writeHead(204);
      res.end();
      return;

    case "/unhealthy":
      res.writeHead(503);
      res.end("Unavailable");
      return;

    case "/flaky":
      flakyRequests++;

      if (flakyRequests < 3) {
        res.writeHead(503);
        res.end("Starting");
      } else {
        res.writeHead(200);
        res.end("Healthy");
      }
      return;

    default:
      res.writeHead(404);
      res.end("Not Found");
  }
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}`;

const configs: EnvironmentHealthConfig = {
  test: {
    healthUrl: `${base}/test-health`,
  },
  prod: {
    healthUrl: `${base}/prod-health`,
  },
};

try {
  // TEST 1 — TEST selects test health URL
  {
    const result = await checkEnvironmentHealth("TEST", configs, {
      retries: 0,
    });

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 200);
    assert.equal(testRequests, 1);
    assert.equal(prodRequests, 0);

    console.log("Test 1 passed: TEST environment URL selected");
  }

  // TEST 2 — PROD selects production health URL
  {
    const result = await checkEnvironmentHealth("PROD", configs, {
      retries: 0,
    });

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 204);
    assert.equal(prodRequests, 1);
    assert.equal(testRequests, 1);

    console.log("Test 2 passed: PROD environment URL selected");
  }

  // TEST 3 — Unhealthy service returns failure
  {
    const result = await checkEnvironmentHealth(
      "TEST",
      {
        test: {
          healthUrl: `${base}/unhealthy`,
        },
      },
      { retries: 0 },
    );

    assert.equal(result.healthy, false);
    assert.equal(result.statusCode, 503);

    console.log("Test 3 passed: Unhealthy service detected");
  }

  // TEST 4 — Retry options are forwarded
  {
    const result = await checkEnvironmentHealth(
      "TEST",
      {
        test: {
          healthUrl: `${base}/flaky`,
        },
      },
      {
        retries: 2,
        delayMs: 10,
        timeoutMs: 1000,
      },
    );

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 200);
    assert.equal(flakyRequests, 3);

    console.log("Test 4 passed: Health retry options forwarded");
  }

  // TEST 5 — Missing environment configuration
  {
    await assert.rejects(() =>
      checkEnvironmentHealth("PROD", {
        test: {
          healthUrl: `${base}/test-health`,
        },
      }),
    );

    await assert.rejects(() => checkEnvironmentHealth("TEST", { test: {} }));

    await assert.rejects(() =>
      checkEnvironmentHealth("TEST", { test: { healthUrl: "   " } }),
    );

    console.log("Test 5 passed: Missing health configuration rejected");
  }

  // TEST 6 — Invalid environment and URL
  {
    await assert.rejects(() =>
      checkEnvironmentHealth("STAGING" as "TEST", configs),
    );

    await assert.rejects(() =>
      checkEnvironmentHealth("TEST", {
        test: {
          healthUrl: "ftp://example.com",
        },
      }),
    );

    await assert.rejects(() =>
      checkEnvironmentHealth("TEST", {
        test: {
          healthUrl: "not-a-valid-url",
        },
      }),
    );

    console.log("Test 6 passed: Invalid environment and URL rejected");
  }

  console.log("All Environment Health Configuration tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
