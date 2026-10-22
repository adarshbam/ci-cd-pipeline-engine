import type { StepExecutionResult } from "../types/step-result.js";
import { runProcess } from "./process-runner.js";

export async function runCommand(
  command: string,
  cwd?: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<StepExecutionResult> {
  return runProcess(["-c", command], cwd, timeoutMs, signal);
}
