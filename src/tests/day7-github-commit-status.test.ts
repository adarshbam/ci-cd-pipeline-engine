import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

import {
  reportGitHubCommitStatus,
  type GitHubCommitStatusInput,
} from "../github/commit-status.js";

const TOKEN = "local-test-token";
const SHA = "a".repeat(40);

interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const requests: CapturedRequest[] = [];

let responseStatus = 201;

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;

  requests.push({
    method: req.method ?? "",
    url: req.url ?? "",
    headers: req.headers,
    body,
  });

  res.writeHead(responseStatus, {
    "Content-Type": "application/json",
  });

  res.end(
    JSON.stringify(
      responseStatus === 201
        ? { id: 123, state: body.state }
        : { message: "Resource not accessible" },
    ),
  );
});

let apiBaseUrl = "";

function createInput(
  overrides: Partial<GitHubCommitStatusInput> = {},
): GitHubCommitStatusInput {
  return {
    repository: "example/day7-project",
    commitSha: SHA,
    state: "pending",
    token: TOKEN,
    apiBaseUrl,
    ...overrides,
  };
}

function lastRequest(): CapturedRequest {
  const request = requests.at(-1);

  assert.ok(request, "Expected GitHub API request");

  return request;
}

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  apiBaseUrl = `http://127.0.0.1:${address.port}`;

  // TEST 1 — Pending status
  {
    await reportGitHubCommitStatus(
      createInput({
        state: "pending",
        description: "Pipeline running",
        context: "custom-ci/pipeline",
      }),
    );

    const request = lastRequest();

    assert.equal(request.method, "POST");

    assert.equal(request.url, `/repos/example/day7-project/statuses/${SHA}`);

    assert.equal(request.body.state, "pending");
    assert.equal(request.body.description, "Pipeline running");
    assert.equal(request.body.context, "custom-ci/pipeline");

    assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);

    console.log("Test 1 passed: Pending status reported");
  }

  // TEST 2 — Successful pipeline
  {
    await reportGitHubCommitStatus(
      createInput({
        state: "success",
        description: "All jobs passed",
      }),
    );

    assert.equal(lastRequest().body.state, "success");

    console.log("Test 2 passed: Success status reported");
  }

  // TEST 3 — Failed pipeline
  {
    await reportGitHubCommitStatus(
      createInput({
        state: "failure",
        description: "Build failed",
      }),
    );

    assert.equal(lastRequest().body.state, "failure");

    console.log("Test 3 passed: Failure status reported");
  }

  // TEST 4 — Infrastructure error
  {
    await reportGitHubCommitStatus(
      createInput({
        state: "error",
        description: "Scheduler crashed",
      }),
    );

    assert.equal(lastRequest().body.state, "error");

    console.log("Test 4 passed: Error status reported");
  }

  // TEST 5 — Optional status metadata
  {
    await reportGitHubCommitStatus(
      createInput({
        state: "success",
        context: "custom-ci/build",
        description: "Build completed",
        targetUrl: "https://ci.example.com/runs/123",
      }),
    );

    const request = lastRequest();

    assert.equal(request.body.context, "custom-ci/build");

    assert.equal(request.body.description, "Build completed");

    assert.equal(request.body.target_url, "https://ci.example.com/runs/123");

    console.log("Test 5 passed: Metadata included correctly");
  }

  // TEST 6 — Invalid inputs are rejected
  {
    const before = requests.length;

    await assert.rejects(
      reportGitHubCommitStatus(createInput({ token: "" })),
      Error,
    );

    await assert.rejects(
      reportGitHubCommitStatus(createInput({ commitSha: "abc123" })),
      Error,
    );

    await assert.rejects(
      reportGitHubCommitStatus(createInput({ repository: "invalid" })),
      Error,
    );

    await assert.rejects(
      reportGitHubCommitStatus(
        createInput({
          repository: "../other-repository",
        }),
      ),
      Error,
    );

    assert.equal(
      requests.length,
      before,
      "Invalid inputs must not send API requests",
    );

    console.log("Test 6 passed: Invalid inputs rejected");
  }

  // TEST 7 — GitHub API errors propagate safely
  {
    responseStatus = 403;

    try {
      await assert.rejects(
        reportGitHubCommitStatus(createInput({ state: "pending" })),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /403/);

          assert.ok(
            !error.message.includes(TOKEN),
            "Access token must not appear in errors",
          );

          return true;
        },
      );
    } finally {
      responseStatus = 201;
    }

    console.log("Test 7 passed: GitHub API errors handled");
  }

  console.log("ALL DAY 7 GITHUB COMMIT STATUS TESTS PASSED!");
} finally {
  server.closeAllConnections();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
