import path from "node:path";
import type { Workflow } from "./workflow.js";
import { readFile, readdir } from "node:fs/promises";

async function readWorkflowFile(fileName: string): Promise<Workflow> {
  const workflowPath = path.join(process.cwd(), "workflows", fileName);
  const workflowFile = await readFile(workflowPath, "utf-8");
  const workflow: Workflow = JSON.parse(workflowFile);
  return workflow;
}

export async function loadWorkflows(): Promise<Workflow[]> {
  const workflowFolderPath = path.join(process.cwd(), "workflows");
  const workflowDirFiles = await readdir(workflowFolderPath, {
    withFileTypes: true,
  });

  const workflows: Workflow[] = [];

  for (const entry of workflowDirFiles) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const workflowJSON = await readWorkflowFile(entry.name);
        if (workflowJSON && typeof workflowJSON === "object" && workflowJSON.name) {
          workflows.push(workflowJSON);
        }
      } catch (err) {
        console.error(`[WorkflowLoader] Failed to parse workflow file ${entry.name}:`, err);
      }
    }
  }

  return workflows;
}
