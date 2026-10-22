import assert from "node:assert/strict";

import { getGitHubToken } from "../github/github-credentials.js";

const originalToken = process.env.GITHUB_TOKEN;

try {
  // TEST 1 — Missing token
  {
    delete process.env.GITHUB_TOKEN;

    assert.throws(() => getGitHubToken(), /GITHUB_TOKEN/);

    console.log("Test 1 passed: Missing token rejected");
  }

  // TEST 2 — Empty token
  {
    process.env.GITHUB_TOKEN = "";

    assert.throws(() => getGitHubToken(), /GITHUB_TOKEN/);

    console.log("Test 2 passed: Empty token rejected");
  }

  // TEST 3 — Whitespace-only token
  {
    process.env.GITHUB_TOKEN = "   ";

    assert.throws(() => getGitHubToken(), /GITHUB_TOKEN/);

    console.log("Test 3 passed: Whitespace token rejected");
  }

  // TEST 4 — Valid token
  {
    process.env.GITHUB_TOKEN = "github-test-token";

    assert.equal(getGitHubToken(), "github-test-token");

    console.log("Test 4 passed: Valid token returned");
  }

  // TEST 5 — Whitespace trimmed
  {
    process.env.GITHUB_TOKEN = "  github-test-token  ";

    assert.equal(getGitHubToken(), "github-test-token");

    console.log("Test 5 passed: Token normalized");
  }

  // TEST 6 — Environment read on each call
  {
    process.env.GITHUB_TOKEN = "first-token";

    assert.equal(getGitHubToken(), "first-token");

    process.env.GITHUB_TOKEN = "second-token";

    assert.equal(getGitHubToken(), "second-token");

    console.log("Test 6 passed: Environment read dynamically");
  }

  console.log("ALL DAY 7 GITHUB CREDENTIAL TESTS PASSED!");
} finally {
  if (originalToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalToken;
  }
}
