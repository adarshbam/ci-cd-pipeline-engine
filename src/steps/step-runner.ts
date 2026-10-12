import type { Step } from "../workflow/workflow.js";

import type { StepExecutionResult } from "../types/step-result.js";

import { runCommand } from "./command-runner.js";
import { runScript } from "./script-runner.js";

export async function runStep(
  step: Step,
  cwd?: string,
): Promise<StepExecutionResult> {
  if ("run" in step) {
    return runCommand(step.run, cwd);
  } else if ("script" in step) {
    return runScript(step.script, cwd);
  } else {
    throw new Error("No run or script property exist in this step");
  }
}
