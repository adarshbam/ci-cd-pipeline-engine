import type { Environment } from "../workflow/workflow.js";

export function resolveEnvironment(branch: string): Environment {
  if (branch === "develop") return "TEST";
  else if (branch === "main") return "PROD";
  else throw new Error("Enviroment for this branch doesn't exist");
}
