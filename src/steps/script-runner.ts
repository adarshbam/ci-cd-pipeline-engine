import type { StepExecutionResult } from "../types/step-result.js";
import { runProcess } from "./process-runner.js";

export async function runScript(
  runScriptPath: string,
  cwd?: string,
): Promise<StepExecutionResult> {
  return runProcess([runScriptPath], cwd);
}
