import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, access, rm } from "node:fs/promises";
import { join } from "node:path";

import { createWorkspace } from "../runner/workspace.js";
import { runCommand } from "../steps/command-runner.js";
import { runScript } from "../steps/script-runner.js";
import { runStep } from "../steps/step-runner.js";
import { runSteps } from "../steps/steps-runner.js";

const workspace = await createWorkspace();

try {
  // Prepare a test script inside the workspace.
  await mkdir(join(workspace, "scripts"));

  await writeFile(
    join(workspace, "scripts", "append.sh"),
    "#!/usr/bin/env bash\nprintf '2' >> sequence.txt\n",
  );

  // TEST 1: CommandRunner respects cwd.
  const command = await runCommand("printf 'hello' > command.txt", workspace);

  assert.equal(command.status, "SUCCESS");
  assert.equal(await readFile(join(workspace, "command.txt"), "utf8"), "hello");

  // TEST 2: ScriptRunner respects cwd.
  const script = await runScript("scripts/append.sh", workspace);

  assert.equal(script.status, "SUCCESS");

  // TEST 3: StepRunner forwards cwd.
  const step = await runStep(
    { name: "Create marker", run: "printf 'step' > step.txt" },
    workspace,
  );

  assert.equal(step.status, "SUCCESS");
  assert.equal(await readFile(join(workspace, "step.txt"), "utf8"), "step");

  // TEST 4: StepsRunner forwards cwd to all steps.
  const results = await runSteps(
    [
      { name: "First", run: "printf '1' > sequence.txt" },
      { name: "Second", script: "scripts/append.sh" },
      { name: "Third", run: "printf '3' >> sequence.txt" },
    ],
    workspace,
  );

  assert.equal(results.length, 3);
  assert.deepEqual(
    results.map((result) => result.status),
    ["SUCCESS", "SUCCESS", "SUCCESS"],
  );

  assert.equal(await readFile(join(workspace, "sequence.txt"), "utf8"), "123");

  // TEST 5: No later step executes after failure.
  const failedResults = await runSteps(
    [
      { name: "Fail", run: "exit 9" },
      { name: "Never run", run: "printf 'NO' > skipped.txt" },
    ],
    workspace,
  );

  assert.equal(failedResults.length, 1);
  assert.equal(failedResults[0]!.status, "FAILED");
  assert.equal(failedResults[0]!.exitCode, 9);

  await assert.rejects(access(join(workspace, "skipped.txt")), {
    code: "ENOENT",
  });

  console.log("All workspace execution tests passed!");
} finally {
  await rm(workspace, {
    recursive: true,
    force: true,
  });
}
