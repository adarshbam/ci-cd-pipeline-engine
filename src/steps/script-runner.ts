import { existsSync } from "node:fs";
import path from "node:path";
import type { StepExecutionResult } from "../types/step-result.js";
import { runProcess } from "./process-runner.js";

export async function runScript(
  runScriptPath: string,
  cwd?: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<StepExecutionResult> {
  let resolvedScript = runScriptPath;
  if (cwd && !path.isAbsolute(runScriptPath)) {
    const inWorkspace = path.resolve(cwd, runScriptPath);
    const inRepoRoot = path.resolve(runScriptPath);
    if (!existsSync(inWorkspace) && existsSync(inRepoRoot)) {
      resolvedScript = inRepoRoot.replace(/\\/g, "/");
    }
  }
  return runProcess([resolvedScript], cwd, timeoutMs, signal);
}
