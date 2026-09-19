import path from "node:path";
import type { Workflow } from "./workflow.js";
import { readFile } from "node:fs/promises";

import { readdir } from "fs/promises";
async function readWorkflowFile(fileName: string): Promise<Workflow> {
  const workflowPath = path.join(process.cwd(), "workflows", fileName);

  const workflowFile = await readFile(workflowPath, "utf-8");

  const workflow: Workflow = JSON.parse(workflowFile);
  console.log(workflow);

  return workflow;
}

export async function loadWorkflows(): Promise<Workflow[]> {
  const workflowFolderPath = path.join(process.cwd(), "workflows");
  const workflowDirFiles = await readdir(workflowFolderPath, {
    withFileTypes: true,
  });

  console.log(workflowDirFiles);

  let workflows = [];

  for (const workflow of workflowDirFiles) {
    const isValidJson: Boolean = /^[^.]+\.json$/.test(workflow.name);
    console.log(workflow.name, isValidJson);
    if (workflow.isFile() && isValidJson) {
      const workflowJSON = await readWorkflowFile(workflow.name);

      console.log(workflowJSON);
      console.log(workflowJSON.webhook.url);

      workflows.push(workflowJSON);
    }
  }

  return workflows;
}
