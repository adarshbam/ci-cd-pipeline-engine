import express from "express";
import type { Request, Response } from "express";
import { readWorkflowFile } from "./read-workflow.js";
import { exec, spawn } from "child_process";
import "fs/promises";
import { readdir } from "fs/promises";
import path from "path";
import { PORT } from "./config/config.js";
import { config } from "process";
import { runGrok } from "./utils/run-ngrok.js";

const app = express();

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Hello from TypeScript + Express.",
  });
});

async function runScript(runScriptPath: string): Promise<String> {
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
  // await exec(`bash ${config.deployment.runScript}`, (error, stdout, stderr) => {
  //   if (error) {
  //     console.error("Deployment failed:", error.message);
  //     return error.message;
  //   }

  //   console.log("Deployment output:");
  //   console.log(stdout);
  // });
  // return "Script exectured successfully";
}

async function runAllWorkflows() {
  const workflowFolderPath = path.join(process.cwd(), "src", "workflows");
  const workflows = await readdir(workflowFolderPath, { withFileTypes: true });

  console.log(workflows);
  for (const workflow of workflows) { 
    const isValidJson: Boolean = /^[^.]+\.json$/.test(workflow.name);
    console.log(workflow.name, isValidJson);
    if (workflow.isFile() && isValidJson) {
      const workflowJSON = await readWorkflowFile(workflow.name);
      console.log(workflowJSON);
      console.log(workflowJSON.webhook.url);

      app.get(`${workflowJSON.webhook.url}`, async (req, res) => {
        runScript(workflowJSON.deployment.runScript);

        return res.status(200).json({
          workflowJSON,
        });
      });
    }
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Run ngrok at ${PORT} using this command`);

  console.log(`ngrok http ${String(PORT)}`);
  runGrok();

  runAllWorkflows();
});
