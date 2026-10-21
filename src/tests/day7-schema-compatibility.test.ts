import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schemaPath = new URL(
  "../../workflows/schema/workflow.schema.json",
  import.meta.url,
);

const capstonePath = new URL(
  "../../workflows/day7-capstone.json",
  import.meta.url,
);

const rollbackPath = new URL(
  "../../workflows/day7-health-rollback.json",
  import.meta.url,
);

type SchemaProperty = {
  type?: string;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  $ref?: string;
  items?: SchemaProperty;
  enum?: string[];
};

type Definition = {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};

type Schema = {
  $defs: Record<string, Definition>;
  properties: Record<string, SchemaProperty>;
};

const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Schema;

const capstone = JSON.parse(await readFile(capstonePath, "utf8"));

const rollbackWorkflow = JSON.parse(await readFile(rollbackPath, "utf8"));

const definitions = schema.$defs;

const job = definitions.job;
const step = definitions.step;
const environment = definitions.environment;

assert.ok(job?.properties);
assert.ok(step?.properties);
assert.ok(environment?.properties);

// TEST 1 — Job-level health checks
assert.equal(job.properties.healthCheck?.type, "boolean");

assert.equal(rollbackWorkflow.jobs.deploy.healthCheck, true);

console.log("Test 1 passed: Job health checks supported");

// TEST 2 — Rollback configuration
assert.equal(job.properties.rollback?.$ref, "#/$defs/rollback");

assert.ok(definitions.rollback);

assert.ok(definitions.rollback.required?.includes("steps"));

assert.ok(definitions.rollback.properties?.steps);

assert.ok(rollbackWorkflow.jobs.deploy.rollback.steps.length > 0);

console.log("Test 2 passed: Rollback configuration supported");

// TEST 3 — Timeout and retry definitions
assert.equal(step.properties.timeoutMs?.type, "integer");

assert.equal(step.properties.timeoutMs?.minimum, 1);

assert.equal(step.properties.retries?.type, "integer");

assert.equal(step.properties.retries?.minimum, 0);

console.log("Test 3 passed: Timeout and retry properties supported");

// TEST 4 — Local and production health URLs
const pattern = environment.properties.healthUrl?.pattern;

assert.ok(pattern);

const healthUrlPattern = new RegExp(pattern);

assert.ok(healthUrlPattern.test("http://127.0.0.1:3000/health"));

assert.ok(healthUrlPattern.test("https://api.example.com/health"));

assert.equal(healthUrlPattern.test("http://api.example.com/health"), false);

console.log("Test 4 passed: Health URL rules configured");

// TEST 5 — Existing definitions preserved
for (const name of [
  "job",
  "step",
  "environment",
  "webhook",
  "trigger",
  "retryPolicy",
  "jobArtifacts",
  "artifact",
  "artifactReference",
  "runner",
  "concurrency",
  "notifications",
  "healthCheck",
]) {
  assert.ok(definitions[name], `Missing original definition: ${name}`);
}

console.log("Test 5 passed: Existing schema definitions preserved");

// TEST 6 — All local references resolve
function verifyReferences(value: unknown, location = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      verifyReferences(item, `${location}[${index}]`);
    });
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  const object = value as Record<string, unknown>;

  for (const [key, nested] of Object.entries(object)) {
    if (
      key === "$ref" &&
      typeof nested === "string" &&
      nested.startsWith("#/$defs/")
    ) {
      const referencedName = nested.slice("#/$defs/".length);

      assert.ok(
        definitions[referencedName],
        `Broken reference at ${location}: ${nested}`,
      );
    } else {
      verifyReferences(nested, `${location}.${key}`);
    }
  }
}

verifyReferences(schema);

console.log("Test 6 passed: All local schema references resolve");

// TEST 7 — Capstone and health-rollback workflows
for (const workflow of [capstone, rollbackWorkflow]) {
  assert.ok(workflow.name);
  assert.ok(workflow.webhook.url);
  assert.ok(workflow.trigger.events.length > 0);
  assert.ok(Object.keys(workflow.jobs).length > 0);

  for (const configuration of Object.values(workflow.jobs) as Array<{
    steps: unknown[];
    healthCheck?: boolean;
    rollback?: { steps: unknown[] };
  }>) {
    assert.ok(configuration.steps.length > 0);

    if (configuration.healthCheck !== undefined) {
      assert.equal(typeof configuration.healthCheck, "boolean");
    }

    if (configuration.rollback !== undefined) {
      assert.ok(configuration.rollback.steps.length > 0);
    }
  }
}

console.log("Test 7 passed: Day 7 workflows structurally compatible");

// TEST 8 — Webhook methods
const webhookMethods = definitions.webhook?.properties?.methods?.items?.enum;

assert.ok(webhookMethods?.includes("GET"));
assert.ok(webhookMethods?.includes("POST"));

console.log("Test 8 passed: GET and POST webhook methods supported");

console.log("ALL DAY 7 SCHEMA COMPATIBILITY TESTS PASSED!");
