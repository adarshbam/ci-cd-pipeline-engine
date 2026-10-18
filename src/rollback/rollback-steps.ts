import { withWorkspace } from "../runner/workspace.js";
import { runStep } from "../steps/step-runner.js";
import type { RollbackConfig } from "../workflow/workflow.js";
import { executeRollback, type RollbackResult } from "./rollback-executor.js";
import { validateRollbackConfig } from "./rollback-validator.js";

export async function executeRollbackSteps(
  config: RollbackConfig,
): Promise<RollbackResult> {
  validateRollbackConfig(config);

  const validatedSteps = config.steps;

  return await executeRollback(async () => {
    await withWorkspace(async (workspacePath) => {
      for (const step of validatedSteps) {
        const result = await runStep(step, workspacePath);

        if (result.status === "FAILED") {
          throw new Error("Step failed in our Rollback");
        }
      }
    });
  });
}
