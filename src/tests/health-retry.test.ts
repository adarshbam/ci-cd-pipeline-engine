import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { checkHealthWithRetries } from "../health/health-retry.js";

let healthyRequests = 0;
let flakyRequests = 0;
let failedRequests = 0;
let noRetryRequests = 0;
let delayedRequests = 0;
let timeoutRequests = 0;

const server = createServer((req, res) => {
  switch (req.url) {
    case "/healthy":
      healthyRequests++;
      res.writeHead(200);
      res.end("OK");
      return;

    case "/flaky":
      flakyRequests++;

      if (flakyRequests < 3) {
        res.writeHead(503);
        res.end("Starting");
      } else {
        res.writeHead(200);
        res.end("Ready");
      }
      return;

    case "/always-fail":
      failedRequests++;
      res.writeHead(503);
      res.end("Unavailable");
      return;

    case "/no-retries":
      noRetryRequests++;
      res.writeHead(503);
      res.end("Unavailable");
      return;

    case "/delayed":
      delayedRequests++;

      if (delayedRequests === 1) {
        res.writeHead(503);
        res.end("Starting");
      } else {
        res.writeHead(200);
        res.end("Ready");
      }
      return;

    case "/timeout":
      timeoutRequests++;

      setTimeout(() => {
        if (!res.destroyed) {
          res.writeHead(200);
          res.end("Slow response");
        }
      }, 300);
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

try {
  // TEST 1 — Healthy immediately
  {
    const result = await checkHealthWithRetries(`${base}/healthy`, {
      retries: 3,
      delayMs: 10,
    });

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 200);
    assert.equal(healthyRequests, 1);

    console.log("Test 1 passed: Stops on first success");
  }

  // TEST 2 — Recover after two failed attempts
  {
    const result = await checkHealthWithRetries(`${base}/flaky`, {
      retries: 3,
      delayMs: 10,
    });

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 200);
    assert.equal(flakyRequests, 3);

    console.log("Test 2 passed: Retries until healthy");
  }

  // TEST 3 — All retry attempts exhausted
  {
    const result = await checkHealthWithRetries(`${base}/always-fail`, {
      retries: 2,
      delayMs: 10,
    });

    assert.equal(result.healthy, false);
    assert.equal(result.statusCode, 503);

    // Initial attempt + two retries
    assert.equal(failedRequests, 3);

    console.log("Test 3 passed: Retry limit enforced");
  }

  // TEST 4 — Zero retries still checks once
  {
    const result = await checkHealthWithRetries(`${base}/no-retries`, {
      retries: 0,
      delayMs: 0,
    });

    assert.equal(result.healthy, false);
    assert.equal(noRetryRequests, 1);

    console.log("Test 4 passed: Zero retries checks once");
  }

  // TEST 5 — Delay occurs between attempts
  {
    const started = Date.now();

    const result = await checkHealthWithRetries(`${base}/delayed`, {
      retries: 1,
      delayMs: 100,
    });

    const elapsed = Date.now() - started;

    assert.equal(result.healthy, true);
    assert.equal(delayedRequests, 2);

    assert.ok(elapsed >= 80, `Retry delay was too short: ${elapsed}ms`);

    console.log("Test 5 passed: Retry delay respected");
  }

  // TEST 6 — Timeouts and invalid configuration
  {
    const result = await checkHealthWithRetries(`${base}/timeout`, {
      retries: 1,
      delayMs: 10,
      timeoutMs: 30,
    });

    assert.equal(result.healthy, false);
    assert.equal(timeoutRequests, 2);

    await assert.rejects(() =>
      checkHealthWithRetries(`${base}/healthy`, {
        retries: -1,
      }),
    );

    await assert.rejects(() =>
      checkHealthWithRetries(`${base}/healthy`, {
        retries: 1.5,
      }),
    );

    await assert.rejects(() =>
      checkHealthWithRetries(`${base}/healthy`, {
        delayMs: -10,
      }),
    );

    await assert.rejects(() =>
      checkHealthWithRetries(`${base}/healthy`, {
        delayMs: 1.5,
      }),
    );

    await assert.rejects(() =>
      checkHealthWithRetries(`${base}/healthy`, {
        timeoutMs: 0,
      }),
    );

    await assert.rejects(() =>
      checkHealthWithRetries(`${base}/healthy`, {
        retries: Number.MAX_SAFE_INTEGER + 1,
      }),
    );

    console.log("Test 6 passed: Timeouts and validation handled");
  }

  console.log("All Health Retry tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
