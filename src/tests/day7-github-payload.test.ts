import assert from "node:assert/strict";
import { extractGitHubPush } from "../routes/github-payload.js";

const VALID_SHA = "a".repeat(40);

function createPayload() {
  return {
    ref: "refs/heads/main",
    after: VALID_SHA,
    deleted: false,
    repository: {
      id: 12345,
      full_name: "example/day7-project",
    },
  };
}

function expectInvalid(payload: unknown, description: string): void {
  assert.throws(() => extractGitHubPush(payload), Error, description);
}

// TEST 1 — Valid main branch push
{
  const result = extractGitHubPush(createPayload());

  assert.deepEqual(result, {
    repository: "example/day7-project",
    branch: "main",
    commitSha: VALID_SHA,
  });

  console.log("Test 1 passed: Main branch push extracted");
}

// TEST 2 — Nested feature branch
{
  const payload = createPayload();
  payload.ref = "refs/heads/feature/new-api";

  const result = extractGitHubPush(payload);

  assert.equal(result.branch, "feature/new-api");
  assert.equal(result.repository, "example/day7-project");

  console.log("Test 2 passed: Nested branch extracted");
}

// TEST 3 — Non-object payloads rejected
{
  for (const invalid of [null, undefined, "", "hello", 123, []]) {
    expectInvalid(invalid, "Non-object GitHub payload must be rejected");
  }

  console.log("Test 3 passed: Invalid payload types rejected");
}

// TEST 4 — Tag pushes and invalid refs rejected
{
  expectInvalid(
    {
      ...createPayload(),
      ref: "refs/tags/v1.0.0",
    },
    "Tag push must not be treated as branch push",
  );

  expectInvalid(
    {
      ...createPayload(),
      ref: "refs/heads/",
    },
    "Empty branch rejected",
  );

  expectInvalid(
    {
      ...createPayload(),
      ref: "main",
    },
    "Unqualified branch rejected",
  );

  console.log("Test 4 passed: Invalid branch refs rejected");
}

// TEST 5 — Repository information validated
{
  expectInvalid(
    {
      ...createPayload(),
      repository: undefined,
    },
    "Missing repository rejected",
  );

  expectInvalid(
    {
      ...createPayload(),
      repository: {},
    },
    "Missing repository name rejected",
  );

  expectInvalid(
    {
      ...createPayload(),
      repository: {
        full_name: "",
      },
    },
    "Empty repository name rejected",
  );

  console.log("Test 5 passed: Repository information validated");
}

// TEST 6 — Commit SHA validated
{
  expectInvalid(
    {
      ...createPayload(),
      after: undefined,
    },
    "Missing commit SHA rejected",
  );

  expectInvalid(
    {
      ...createPayload(),
      after: "abc123",
    },
    "Short commit SHA rejected",
  );

  expectInvalid(
    {
      ...createPayload(),
      after: "z".repeat(40),
    },
    "Non-hex SHA rejected",
  );

  console.log("Test 6 passed: Invalid commit SHAs rejected");
}

// TEST 7 — Deleted branch is not executable
{
  expectInvalid(
    {
      ...createPayload(),
      deleted: true,
      after: "0".repeat(40),
    },
    "Deleted branch must not trigger execution",
  );

  console.log("Test 7 passed: Deleted branch rejected");
}

// TEST 8 — Input is not mutated
{
  const payload = createPayload();

  const original = structuredClone(payload);

  const result = extractGitHubPush(payload);

  assert.deepEqual(payload, original);

  assert.notEqual(result, payload, "Extractor must create a new result object");

  console.log("Test 8 passed: Original payload unchanged");
}

console.log("ALL DAY 7 GITHUB PAYLOAD EXTRACTION TESTS PASSED!");
