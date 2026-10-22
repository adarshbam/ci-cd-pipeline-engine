import type { Step } from "../workflow/workflow.js";
import type { StepExecutionResult } from "../types/step-result.js";
import { runStep } from "./step-runner.js";

export async function runSteps(
  steps: Step[],
  cwd?: string,
  signal?: AbortSignal,
): Promise<StepExecutionResult[]> {
  const results: StepExecutionResult[] = [];

  // 1. Iterate through steps sequentially.
  for (const step of steps) {
    if (signal?.aborted) {
      results.push({
        exitCode: null,
        stdout: "",
        stderr: "Step cancelled",
        startedAt: new Date(),
        finishedAt: new Date(),
        status: "CANCELLED",
      });
      break;
    }

    const result = await runStep(step, cwd, signal);
    results.push(result);
    if (result.status !== "SUCCESS") break;
  }

  return results;
}
