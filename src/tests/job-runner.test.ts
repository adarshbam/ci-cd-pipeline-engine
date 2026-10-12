import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { executeStepsInWorkspace } from "../runner/job-runner.js";

const filename = `workspace-${randomUUID()}.txt`;

try {
  // TEST 1: Steps share the same workspace.

  const success = await executeStepsInWorkspace([
    {
      name: "Create file",
      run: `printf 'hello' > ${filename}`,
    },
    {
      name: "Read file",
      run: `cat ${filename}`,
    },
  ]);

  assert.equal(success.length, 2);

  assert.deepEqual(
    success.map((result) => result.status),
    ["SUCCESS", "SUCCESS"],
  );

  assert.equal(success[1]!.stdout.trim(), "hello");

  // File must not have been created in the server's
  // own working directory.
  await assert.rejects(access(join(process.cwd(), filename)), {
    code: "ENOENT",
  });

  // TEST 2: Stop after a failed step.

  const failed = await executeStepsInWorkspace([
    {
      name: "First",
      run: "echo starting",
    },
    {
      name: "Intentional failure",
      run: "exit 7",
    },
    {
      name: "Should not execute",
      run: "echo SHOULD_NOT_RUN",
    },
  ]);

  assert.equal(failed.length, 2);
  assert.equal(failed[0]!.status, "SUCCESS");
  assert.equal(failed[1]!.status, "FAILED");
  assert.equal(failed[1]!.exitCode, 7);

  // TEST 3: Empty job.
  const empty = await executeStepsInWorkspace([]);

  assert.deepEqual(empty, []);

  console.log("All JobRunner tests passed!");
} finally {
  // Defensive cleanup if a broken runner wrote
  // the test file to the project root.
  await rm(join(process.cwd(), filename), {
    force: true,
  });
}
