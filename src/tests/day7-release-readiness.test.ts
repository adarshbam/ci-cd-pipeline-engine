import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

function projectPath(...parts: string[]): string {
  return join(root, ...parts);
}

async function readProjectFile(...parts: string[]): Promise<string> {
  return readFile(projectPath(...parts), "utf8");
}

function gitSuccess(...args: string[]): boolean {
  try {
    execFileSync("git", args, {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

interface WorkflowConfiguration {
  name?: string;
  $schema?: string;
  webhook?: {
    url?: string;
    methods?: string[];
  };
  trigger?: {
    events?: string[];
    allowedBranches?: string[];
    allowedRepositories?: string[];
  };
}

// ==================================================
// TEST 1 — Environment template
// ==================================================
{
  const template = await readProjectFile(".env.example");

  const requiredVariables = [
    "GITHUB_WEBHOOK_SECRET",
    "GITHUB_TOKEN",
    "DAY7_LIVE_BASE_URL",
  ];

  for (const variable of requiredVariables) {
    assert.match(
      template,
      new RegExp(`^${variable}=.+`, "m"),
      `Missing environment variable: ${variable}`,
    );
  }

  assert.doesNotMatch(
    template,
    /github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}/,
    "Environment template may contain an actual GitHub token",
  );

  console.log("Test 1 passed: Environment template is complete");
}

// ==================================================
// TEST 2 — Local secrets ignored by Git
// ==================================================
{
  await access(projectPath(".gitignore"));

  assert.equal(
    gitSuccess("check-ignore", "-q", ".env"),
    true,
    ".env must be ignored by Git",
  );

  assert.equal(
    gitSuccess("ls-files", "--error-unmatch", ".env"),
    false,
    ".env must not be tracked by Git",
  );

  console.log("Test 2 passed: Local environment secrets excluded from Git");
}

// ==================================================
// TEST 3 — Live GitHub workflow restrictions
// ==================================================
{
  const content = await readProjectFile("workflows", "day7-live-github.json");

  const workflow = JSON.parse(content) as WorkflowConfiguration;

  assert.equal(workflow.name, "day7-live-github");

  assert.equal(workflow.webhook?.url, "/webhooks/day7-live-github");

  assert.deepEqual(workflow.webhook?.methods, ["POST"]);

  assert.ok(workflow.trigger?.events?.includes("push"));

  assert.deepEqual(workflow.trigger?.allowedBranches, ["main"]);

  assert.deepEqual(workflow.trigger?.allowedRepositories, [
    "adarshbam/ci-cd-pipeline-engine",
  ]);

  console.log("Test 3 passed: Live GitHub workflow restrictions configured");
}

// ==================================================
// TEST 4 — Schema references and credential checks
// ==================================================
{
  const directory = projectPath("workflows");

  const filenames = (await readdir(directory)).filter(
    (name) => name.startsWith("day7-") && name.endsWith(".json"),
  );

  assert.ok(filenames.length > 0, "No Day 7 workflow files found");

  const schemaDirectory = resolve(directory, "schema");

  for (const filename of filenames) {
    const content = await readFile(join(directory, filename), "utf8");

    const workflow = JSON.parse(content) as WorkflowConfiguration;

    assert.ok(workflow.$schema, `${filename}: Missing $schema`);

    const schemaPath = resolve(directory, workflow.$schema);

    assert.ok(
      schemaPath.startsWith(schemaDirectory + sep),
      `${filename}: Schema must remain in workflows/schema`,
    );

    await access(schemaPath);

    assert.doesNotMatch(
      content,
      /github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}/,
      `${filename}: Possible embedded GitHub token`,
    );
  }

  console.log(
    `Test 4 passed: ${filenames.length} Day 7 workflows have resolvable schemas and no recognizable GitHub tokens`,
  );
}

// ==================================================
// TEST 5 — Release documentation
// ==================================================
{
  const documentation = await readProjectFile("docs", "RELEASE.md");

  const requirements = [
    "GITHUB_WEBHOOK_SECRET",
    "GITHUB_TOKEN",
    "ngrok http",
    "git push origin main",
    "npx tsc --noEmit",
    "node --env-file=.env",
    "rollback",
    "not a production deployment",
  ];

  for (const requirement of requirements) {
    assert.ok(
      documentation.toLowerCase().includes(requirement.toLowerCase()),
      `Missing documentation: ${requirement}`,
    );
  }

  console.log("Test 5 passed: Release, recovery and security steps documented");
}

// ==================================================
// TEST 6 — Runtime and project entry points
// ==================================================
{
  const requiredFiles = [
    "package.json",
    "tsconfig.json",
    "README.md",
    "src/server.ts",
    "src/routes/webhook.routes.ts",
    "src/pipeline/pipeline-engine.ts",
    "src/github/commit-status.ts",
  ];

  for (const filename of requiredFiles) {
    await access(projectPath(filename));
  }

  const packageJSON = JSON.parse(await readProjectFile("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const dependencies = {
    ...packageJSON.dependencies,
    ...packageJSON.devDependencies,
  };

  assert.ok(dependencies.typescript, "TypeScript dependency missing");

  assert.ok(dependencies.tsx, "tsx dependency missing");

  console.log("Test 6 passed: Project files and tooling available");
}

console.log("");
console.log("ALL DAY 7 RELEASE READINESS TESTS PASSED!");
