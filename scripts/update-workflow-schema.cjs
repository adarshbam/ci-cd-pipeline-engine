const fs = require("node:fs");
const path = require("node:path");

const schemaPath = path.resolve(
  process.cwd(),
  "workflows/schema/workflow.schema.json",
);

const original = fs.readFileSync(schemaPath, "utf8");
const schema = JSON.parse(original);

if (
  !schema.$defs?.job?.properties ||
  !schema.$defs?.step?.properties ||
  !schema.$defs?.environment?.properties
) {
  throw new Error("Unexpected workflow schema structure");
}

const defs = schema.$defs;

// 1. Job-level health checks
defs.job.properties.healthCheck = {
  type: "boolean",
  description:
    "Run a post-deployment environment health check after successful job steps. Requires a resolved environment with a configured healthUrl.",
};

// 2. Reusable rollback definition
defs.rollback = {
  type: "object",
  description: "Rollback steps executed after a deployment health check fails.",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      minItems: 1,
      items: {
        allOf: [{ $ref: "#/$defs/step" }, { not: { required: ["uses"] } }],
      },
    },
  },
};

// 3. Job-level rollback configuration
defs.job.properties.rollback = {
  $ref: "#/$defs/rollback",
};

// 4. Step timeout in milliseconds
defs.step.properties.timeoutMs = {
  type: "integer",
  minimum: 1,
  maximum: Number.MAX_SAFE_INTEGER,
  description: "Maximum step execution time in milliseconds.",
};

// 5. Step retry count
defs.step.properties.retries = {
  type: "integer",
  minimum: 0,
  maximum: 20,
  description: "Number of retries allowed after the initial attempt.",
};

// 6. Allow local development health endpoints.
// External production endpoints remain HTTPS-only.
defs.environment.properties.healthUrl = {
  type: "string",
  format: "uri",
  pattern:
    "^(?:https://|http://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::[0-9]{1,5})?(?:/|$))",
  description:
    "HTTPS health URL, or loopback HTTP URL for local development and tests.",
};

// 7. Support the webhook methods used by the engine.
defs.webhook.properties.methods.items.enum = ["GET", "POST"];

// 8. Preserve original file before regeneration.
const backupPath = schemaPath + ".before-day7.backup";

if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original);
}

// 9. Generate the COMPLETE updated schema.
fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + "\n", "utf8");

console.log("Workflow schema updated successfully.");
console.log(`Output: ${schemaPath}`);
console.log(`Original backup: ${backupPath}`);
console.log(`Definitions preserved/extended: ${Object.keys(defs).length}`);
