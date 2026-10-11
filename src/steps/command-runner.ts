import { spawn } from "node:child_process";

import type { StepExecutionResult } from "../types/step-result.js";

export async function runCommand(
  command: string,
): Promise<StepExecutionResult> {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();

    const commandExec = spawn("bash", ["-c", command]);

    let stdout = "";
    let stderr = "";

    commandExec.stdout.on("data", (data) => {
      stdout += data.toString();
      console.error(data.toString());
    });

    commandExec.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    commandExec.on("close", (code) => {
      const result: StepExecutionResult = {
        exitCode: code,
        stdout: stdout,
        stderr: stderr,
        startedAt: new Date(),
        finishedAt: new Date(),
        status: code === 0 ? "SUCCESS" : "FAILED",
      };

      if (code === 0) {
        resolve("Command Executed Successfully.");
      } else {
        reject(new Error(`Comand exited with code ${code}`));
      }

      return result;
    });

    commandExec.on("error", reject);
  });
}
