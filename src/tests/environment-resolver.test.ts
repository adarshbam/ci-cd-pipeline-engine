import assert from "node:assert/strict";
import { resolveEnvironment } from "../environments/environment-resolver.js";

// Test 1: Develop branch targets TEST
assert.equal(resolveEnvironment("develop"), "TEST");

console.log("Test 1 passed: develop resolves to TEST");

// Test 2: Main branch targets PROD
assert.equal(resolveEnvironment("main"), "PROD");

console.log("Test 2 passed: main resolves to PROD");

// Test 3: Feature branches are rejected
assert.throws(() => resolveEnvironment("feature/login"), Error);

console.log("Test 3 passed: Feature branch rejected");

// Test 4: Empty branch is rejected
assert.throws(() => resolveEnvironment(""), Error);

console.log("Test 4 passed: Empty branch rejected");

// Test 5: Branch matching is case-sensitive
for (const branch of ["Main", "MAIN", "Develop", "DEVELOP"]) {
  assert.throws(() => resolveEnvironment(branch), Error);
}

console.log("Test 5 passed: Case-sensitive branch matching");

// Test 6: Unknown branches cannot default to PROD
for (const branch of [
  "unknown",
  "release/v1",
  "hotfix/security",
  "production",
]) {
  assert.throws(() => resolveEnvironment(branch), Error);
}

console.log("Test 6 passed: Unsupported branches rejected");

console.log("All Environment Resolver tests passed!");
