import type { RollbackConfig } from "../workflow/workflow.js";

export function validateRollbackConfig(
  config: RollbackConfig | undefined,
): void {
  if (config === undefined) return;

  const steps = config.steps;

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("Rollback steps must be a non-empty array");
  }

  for (const step of steps) {
    if (!step || typeof step !== "object") {
      throw new Error("Invalid rollback step");
    }

    if (typeof step.name !== "string" || !step.name.trim()) {
      throw new Error("Step name is required");
    }

    const hasRun = "run" in step;
    const hasScript = "script" in step;

    if (!hasRun && !hasScript) {
      throw new Error("Step requires run or script");
    }

    if (hasRun && hasScript) {
      throw new Error("Step cannot have both run and script");
    }

    if (hasRun) {
      if (typeof step.run !== "string" || !step.run.trim()) {
        throw new Error("Command cannot be empty");
      }
    }

    if (hasScript) {
      if (typeof step.script !== "string" || !step.script.trim()) {
        throw new Error("Script cannot be empty");
      }
    }
  }
}
