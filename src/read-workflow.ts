import path from "node:path";
import type { Workflow } from "./types/workflow.js";
import { readFile } from "node:fs/promises";

export async function readWorkflowFile(fileName: string): Promise<Workflow> {
  const workflowPath = path.join(process.cwd(), "src", "workflows", fileName);

  const workflowFile = await readFile(workflowPath, "utf-8");

  const workflow: Workflow = JSON.parse(workflowFile);
  console.log(workflow);

  return workflow;
}
