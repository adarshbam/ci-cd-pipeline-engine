import assert from "node:assert/strict";

import { validateRetries } from "../steps/retry-validator.js";

// ====================================
// TEST 1: Missing retries are valid
// ====================================

assert.doesNotThrow(() => validateRetries(undefined));

console.log("Test 1 passed: Optional retries accepted");

// ====================================
// TEST 2: Zero retries are valid
// ====================================

assert.doesNotThrow(() => validateRetries(0));

console.log("Test 2 passed: Zero retries accepted");

// ====================================
// TEST 3: Valid positive integers
// ====================================

for (const retries of [1, 2, 3, 5, 10]) {
  assert.doesNotThrow(() => validateRetries(retries));
}

console.log("Test 3 passed: Valid retry counts accepted");

// ====================================
// TEST 4: Negative values rejected
// ====================================

for (const retries of [-1, -5, -100]) {
  assert.throws(() => validateRetries(retries), Error);
}

console.log("Test 4 passed: Negative retries rejected");

// ====================================
// TEST 5: Fractional values rejected
// ====================================

for (const retries of [0.5, 1.5, 2.75]) {
  assert.throws(() => validateRetries(retries), Error);
}

console.log("Test 5 passed: Fractional retries rejected");

// ====================================
// TEST 6: Non-finite numbers rejected
// ====================================

for (const retries of [NaN, Infinity, -Infinity]) {
  assert.throws(() => validateRetries(retries), Error);
}

console.log("Test 6 passed: Non-finite values rejected");

// ====================================
// TEST 7: Retry limit enforced
// ====================================

for (const retries of [11, 50, 1000000]) {
  assert.throws(() => validateRetries(retries), Error);
}

console.log("Test 7 passed: Retry limit enforced");

// ====================================
// TEST 8: Unsafe integers rejected
// ====================================

assert.throws(() => validateRetries(Number.MAX_SAFE_INTEGER + 1), Error);

console.log("Test 8 passed: Unsafe integers rejected");

console.log("All Retry Validator tests passed!");
