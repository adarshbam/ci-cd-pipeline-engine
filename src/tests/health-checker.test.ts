import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";

import {
  checkHealth,
  type HealthCheckResult,
} from "../health/health-checker.js";

const server = createServer((req, res) => {
  switch (req.url) {
    case "/healthy":
      res.writeHead(200);
      res.end("OK");
      return;

    case "/no-content":
      res.writeHead(204);
      res.end();
      return;

    case "/unhealthy":
      res.writeHead(503);
      res.end("Service Unavailable");
      return;

    case "/slow":
      setTimeout(() => {
        res.writeHead(200);
        res.end("Too late");
      }, 500);
      return;

    default:
      res.writeHead(404);
      res.end("Not Found");
  }
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

const address = server.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}`;

function assertValidDuration(result: HealthCheckResult): void {
  assert.equal(typeof result.durationMs, "number");
  assert.ok(Number.isFinite(result.durationMs));
  assert.ok(result.durationMs >= 0);
}

try {
  // TEST 1 — HTTP 200 is healthy
  {
    const result = await checkHealth(`${base}/healthy`);

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 200);
    assertValidDuration(result);

    console.log("Test 1 passed: HTTP 200 is healthy");
  }

  // TEST 2 — All 2xx responses are healthy
  {
    const result = await checkHealth(`${base}/no-content`);

    assert.equal(result.healthy, true);
    assert.equal(result.statusCode, 204);
    assertValidDuration(result);

    console.log("Test 2 passed: HTTP 204 is healthy");
  }

  // TEST 3 — HTTP 503 is unhealthy
  {
    const result = await checkHealth(`${base}/unhealthy`);

    assert.equal(result.healthy, false);
    assert.equal(result.statusCode, 503);
    assertValidDuration(result);

    console.log("Test 3 passed: HTTP 503 is unhealthy");
  }

  // TEST 4 — Slow responses time out
  {
    const result = await checkHealth(`${base}/slow`, 500);

    assert.equal(result.healthy, false);
    assertValidDuration(result);

    console.log("Test 4 passed: Slow request times out");
  }

  // TEST 5 — Network failures are handled
  {
    const result = await checkHealth("http://127.0.0.1:1/", 500);

    assert.equal(result.healthy, false);
    assertValidDuration(result);

    console.log("Test 5 passed: Connection failures handled");
  }

  // TEST 6 — Invalid configuration is rejected
  {
    await assert.rejects(() => checkHealth(""));

    await assert.rejects(() => checkHealth("ftp://example.com"));

    await assert.rejects(() => checkHealth(`${base}/healthy`, 0));

    await assert.rejects(() => checkHealth(`${base}/healthy`, -100));

    console.log("Test 6 passed: Invalid configuration rejected");
  }

  console.log("All HTTP Health Checker tests passed!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
