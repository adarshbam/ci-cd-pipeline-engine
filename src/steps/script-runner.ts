import { exec, spawn } from "child_process";
import type { StepExecutionResult } from "../types/step-result.js";

export async function runScript(runScriptPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptRun = spawn("bash", [runScriptPath]);

    scriptRun.stdout.on("data", (data) => {
      console.log(data.toString());
    });

    scriptRun.stderr.on("data", (data) => {
      console.error(data.toString());
    });

    scriptRun.on("close", (code) => {
      if (code === 0) {
        resolve("Scripted Executed Successfully.");
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    scriptRun.on("error", reject);
  });
}
