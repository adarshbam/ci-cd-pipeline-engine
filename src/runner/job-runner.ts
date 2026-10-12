import type { Step } from "../workflow/workflow.js";
import type { StepExecutionResult } from "../types/step-result.js";

import { withWorkspace } from "./workspace.js";
import { runSteps } from "../steps/steps-runner.js";
export async function executeStepsInWorkspace(
  steps: Step[],
): Promise<StepExecutionResult[]> {
  // Combine withWorkspace() and runSteps().
  return await withWorkspace((workspacePath) => runSteps(steps, workspacePath));
}
