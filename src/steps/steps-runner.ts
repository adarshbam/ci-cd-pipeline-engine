import type { Step } from "../workflow/workflow.js";
import type { StepExecutionResult } from "../types/step-result.js";
import { runStep } from "./step-runner.js";

export async function runSteps(
  steps: Step[],
  cwd?: string,
): Promise<StepExecutionResult[]> {
  const results: StepExecutionResult[] = [];

  // 1. Iterate through steps sequentially.
  for (const step of steps) {
    const result = await runStep(step, cwd);
    results.push(result);
    if (result.status !== "SUCCESS") break;
  }

  return results;
}
