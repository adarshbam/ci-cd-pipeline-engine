import { exec, spawn } from "child_process";

export async function runScript(runScriptPath: string): Promise<String> {
  return new Promise((resolve, reject) => {
    const run = spawn("bash", [runScriptPath]);

    run.stdout.on("data", (data) => {
      console.log(data.toString());
    });

    run.stderr.on("data", (data) => {
      console.error(data.toString());
    });

    run.on("close", (code) => {
      if (code === 0) {
        resolve("Scripted Executed Successfully.");
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    run.on("error", reject);
  });
}
