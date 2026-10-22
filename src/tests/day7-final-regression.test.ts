import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

interface RegressionGroup {
  name: string;
  files: string[];
}

const groups: RegressionGroup[] = [
  {
    name: "Workflow Configuration & Schema",
    files: [
      "day7-workflow-config.test.ts",
      "day7-schema-compatibility.test.ts",
      "day7-github-payload.test.ts",
    ],
  },
  {
    name: "GitHub Security & Deduplication",
    files: [
      "day7-github-webhook.test.ts",
      "day7-webhook-input-hardening.test.ts",
      "day7-github-trigger.test.ts",
      "day7-github-deduplication.test.ts",
      "day7-dedup-hardening.test.ts",
      "day7-workflow-isolation.test.ts",
      "day7-github-credentials.test.ts",
    ],
  },
  {
    name: "GitHub Commit Status Lifecycle",
    files: [
      "day7-github-commit-status.test.ts",
      "day7-github-final-status.test.ts",
      "day7-github-reporting-robustness.test.ts",
      "day7-run-tracking.test.ts",
      "day7-completion-promise.test.ts",
      "day7-wait-for-completion.test.ts",
    ],
  },
  {
    name: "Pipeline Execution & Observability",
    files: [
      "day7-dag-parallel.test.ts",
      "day7-artifact-transfer.test.ts",
      "day7-environment-routing.test.ts",
      "day7-health-rollback.test.ts",
      "day7-observability-integration.test.ts",
    ],
  },
  {
    name: "Failure Recovery & Resource Safety",
    files: [
      "day7-failure-recovery.test.ts",
      "day7-resource-hardening.test.ts",
      "workspace-lifecycle.test.ts",
      "workspace-execution.test.ts",
      "concurrency-final.test.ts",
      "concurrent-failure-robustness.test.ts",
    ],
  },
  {
    name: "GitHub End-to-End Integration",
    files: [
      "day7-github-full-integration.test.ts",
      "day7-github-end-to-end.test.ts",
    ],
  },
];

const totalSuites = groups.reduce(
  (total, group) => total + group.files.length,
  0,
);

let passedSuites = 0;
let failedSuites = 0;

const failures: {
  group: string;
  file: string;
  error: string;
}[] = [];

function getTestPath(filename: string): string {
  return fileURLToPath(new URL(filename, import.meta.url));
}

async function runTestFile(filename: string): Promise<void> {
  const testPath = getTestPath(filename);

  // Fail clearly if a required test file is missing.
  await access(testPath);

  // Each test runs in its own Node process.
  // This prevents in-memory state and mock servers
  // from leaking between regression suites.
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", testPath],
    {
      timeout: 90_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    },
  );

  // Exit code zero is the success criterion.
  // Output is preserved for unexpected warnings.
  if (stderr && /unhandledrejection|uncaughtException/i.test(stderr)) {
    throw new Error(`Unhandled error detected:\n${stderr}`);
  }

  if (!stdout && !stderr) {
    console.log(`  Note: ${filename} produced no output`);
  }
}

async function runGroup(group: RegressionGroup, index: number): Promise<void> {
  console.log("");
  console.log("=".repeat(60));
  console.log(`CHECKPOINT ${index + 1}/${groups.length}`);
  console.log(group.name);
  console.log("=".repeat(60));

  let groupPassed = 0;

  for (const file of group.files) {
    console.log(`Running: ${file}`);

    try {
      await runTestFile(file);

      passedSuites++;
      groupPassed++;

      console.log(`PASS: ${file}`);
    } catch (error) {
      failedSuites++;

      const message = error instanceof Error ? error.message : String(error);

      // execFile errors also contain child process
      // stdout and stderr, which we preserve here.
      const details = error as {
        stdout?: string;
        stderr?: string;
      };

      const diagnostic = [message, details.stdout ?? "", details.stderr ?? ""]
        .filter(Boolean)
        .join("\n");

      failures.push({
        group: group.name,
        file,
        error: diagnostic,
      });

      console.error(`FAIL: ${file}`);

      // Continue running other suites so the final
      // report lists all failing areas.
    }
  }

  console.log("");
  console.log(
    `Checkpoint ${index + 1}: ` + `${groupPassed}/${group.files.length} passed`,
  );
}

console.log("");
console.log("DAY 7 — FINAL SECURITY & RECOVERY REGRESSION");
console.log(`Test suites scheduled: ${totalSuites}`);
console.log(`Major checkpoints: ${groups.length}`);

for (let index = 0; index < groups.length; index++) {
  const group = groups[index];

  assert.ok(group);

  await runGroup(group, index);
}

console.log("");
console.log("=".repeat(60));
console.log("DAY 7 FINAL REGRESSION RESULTS");
console.log("=".repeat(60));
console.log(`Total test suites: ${totalSuites}`);
console.log(`Passed test suites: ${passedSuites}`);
console.log(`Failed test suites: ${failedSuites}`);

const percentage = (passedSuites / totalSuites) * 100;

console.log(`Pass rate: ${percentage.toFixed(1)}%`);

if (failures.length > 0) {
  console.error("");
  console.error("FAILED SUITES:");

  for (const failure of failures) {
    console.error("");
    console.error(`Group: ${failure.group}`);
    console.error(`File: ${failure.file}`);

    // Show the final part of each error to keep
    // terminal output manageable.
    console.error(failure.error.split("\n").slice(-35).join("\n"));
  }
}

assert.equal(failedSuites, 0, `${failedSuites} regression suites failed`);

assert.equal(passedSuites, totalSuites);

console.log("");
console.log("ALL DAY 7 SECURITY & RECOVERY REGRESSIONS PASSED!");
console.log("TASK 7.3 — 100% COMPLETE!");
