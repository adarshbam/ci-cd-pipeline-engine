import type { Step } from "../workflow/workflow.js";
import type { StepExecutionResult } from "../types/step-result.js";
import { runCommand } from "./command-runner.js";
import { runScript } from "./script-runner.js";
import { executeWithRetries } from "./retry-executor.js";

export async function runStep(
  step: Step,
  cwd?: string,
  signal?: AbortSignal,
): Promise<StepExecutionResult> {
  if (signal?.aborted) {
    return {
      exitCode: null,
      stdout: "",
      stderr: "Step cancelled before execution",
      startedAt: new Date(),
      finishedAt: new Date(),
      status: "CANCELLED",
    };
  }

  if ("run" in step) {
    return executeWithRetries(
      () => runCommand(step.run, cwd, step.timeoutMs, signal),
      step.retries,
    );
  } else if ("script" in step) {
    return executeWithRetries(
      () => runScript(step.script, cwd, step.timeoutMs, signal),
      step.retries,
    );
  } else {
    throw new Error("No run or script property exist in this step");
  }
}
