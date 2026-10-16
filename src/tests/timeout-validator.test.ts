import assert from "node:assert/strict";
import { validateTimeoutMs } from "../steps/timeout-validator.js";

// Test 1: Missing timeout is allowed
assert.doesNotThrow(() => validateTimeoutMs(undefined));
console.log("Test 1 passed: Optional timeout accepted");

// Test 2: Positive integers are allowed
for (const timeout of [1, 100, 1000, 30000, 60000]) {
  assert.doesNotThrow(() => validateTimeoutMs(timeout));
}
console.log("Test 2 passed: Valid timeout values accepted");

// Test 3: Zero and negative values rejected
for (const timeout of [0, -1, -1000]) {
  assert.throws(() => validateTimeoutMs(timeout), Error);
}
console.log("Test 3 passed: Non-positive values rejected");

// Test 4: Fractional values rejected
for (const timeout of [0.5, 1.5, 100.25]) {
  assert.throws(() => validateTimeoutMs(timeout), Error);
}
console.log("Test 4 passed: Fractional values rejected");

// Test 5: Non-finite values rejected
for (const timeout of [NaN, Infinity, -Infinity]) {
  assert.throws(() => validateTimeoutMs(timeout), Error);
}
console.log("Test 5 passed: Non-finite values rejected");

// Test 6: Unsafe integers rejected
assert.throws(() => validateTimeoutMs(Number.MAX_SAFE_INTEGER + 1), Error);
console.log("Test 6 passed: Unsafe integers rejected");

console.log("All Timeout Validator tests passed!");
