import type { Step } from "../workflow/workflow.js";
import type { StepExecutionResult } from "../types/step-result.js";

import { withWorkspace } from "./workspace.js";
import { runSteps } from "../steps/steps-runner.js";

export async function executeStepsInWorkspace(
  steps: Step[],
  signal?: AbortSignal,
): Promise<StepExecutionResult[]> {
  return withWorkspace(async (workspacePath) => {
    return executeStepsInExistingWorkspace(steps, workspacePath, signal);
  });
}

export async function executeStepsInExistingWorkspace(
  steps: Step[],
  workspacePath: string,
  signal?: AbortSignal,
): Promise<StepExecutionResult[]> {
  return runSteps(steps, workspacePath, signal);
}
