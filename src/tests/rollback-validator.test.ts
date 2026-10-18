import assert from "node:assert/strict";

import { validateRollbackConfig } from "../rollback/rollback-validator.js";
import type { RollbackConfig } from "../workflow/workflow.js";

function invalidConfig(value: unknown): RollbackConfig {
  return value as RollbackConfig;
}

// TEST 1 — Optional rollback accepted
{
  assert.doesNotThrow(() => {
    validateRollbackConfig(undefined);
  });

  console.log("Test 1 passed: Optional rollback accepted");
}

// TEST 2 — Valid command accepted
{
  assert.doesNotThrow(() => {
    validateRollbackConfig({
      steps: [
        {
          name: "Restore previous version",
          run: "echo rollback",
        },
      ],
    });
  });

  console.log("Test 2 passed: Valid command accepted");
}

// TEST 3 — Valid scripts and multiple steps accepted
{
  assert.doesNotThrow(() => {
    validateRollbackConfig({
      steps: [
        {
          name: "Restore files",
          script: "scripts/restore.sh",
        },
        {
          name: "Restart service",
          run: "echo restart",
        },
      ],
    });
  });

  console.log("Test 3 passed: Multiple rollback steps accepted");
}

// TEST 4 — Missing or empty steps rejected
{
  const invalid = [
    {},
    { steps: [] },
    { steps: null },
    { steps: "echo rollback" },
  ];

  for (const value of invalid) {
    assert.throws(() => {
      validateRollbackConfig(invalidConfig(value));
    });
  }

  console.log("Test 4 passed: Missing rollback steps rejected");
}

// TEST 5 — Missing or ambiguous commands rejected
{
  const invalid = [
    { name: "Missing operation" },
    {
      name: "Ambiguous operation",
      run: "echo rollback",
      script: "scripts/restore.sh",
    },
    {
      name: "Empty command",
      run: "",
    },
    {
      name: "Whitespace command",
      run: "   ",
    },
    {
      name: "Empty script",
      script: "",
    },
  ];

  for (const step of invalid) {
    assert.throws(() => {
      validateRollbackConfig(invalidConfig({ steps: [step] }));
    });
  }

  console.log("Test 5 passed: Invalid rollback commands rejected");
}

// TEST 6 — Missing names and malformed steps rejected
{
  const invalid = [
    { run: "echo rollback" },
    { name: "", run: "echo rollback" },
    { name: "   ", run: "echo rollback" },
    null,
    "rollback",
    123,
  ];

  for (const step of invalid) {
    assert.throws(() => {
      validateRollbackConfig(invalidConfig({ steps: [step] }));
    });
  }

  console.log("Test 6 passed: Malformed rollback steps rejected");
}

console.log("All Rollback Validator tests passed!");
