import { spawn } from "node:child_process";
import type { StepExecutionResult } from "../types/step-result.js";

export async function runProcess(
  args: string[],
  cwd?: string,
): Promise<StepExecutionResult> {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();

    const scriptRun = spawn("bash", args, { cwd });

    let stdout = "";
    let stderr = "";

    scriptRun.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    scriptRun.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    scriptRun.on("close", (code) => {
      const result: StepExecutionResult = {
        exitCode: code,
        stdout: stdout,
        stderr: stderr,
        startedAt: startedAt,
        finishedAt: new Date(),
        status: code === 0 ? "SUCCESS" : "FAILED",
      };

      resolve(result);
    });

    scriptRun.on("error", reject);
  });
}
