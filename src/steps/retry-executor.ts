import type { StepExecutionResult } from "../types/step-result.js";
import { validateRetries } from "./retry-validator.js";

export async function executeWithRetries(
  operation: () => Promise<StepExecutionResult>,
  retries?: number,
): Promise<StepExecutionResult> {
  // Validate retry count
  validateRetries(retries);
  // Calculate maximum attempts
  const maxAttempts = (retries ?? 0) + 1;
  // Repeat:

  let stepExecutionResult = await operation();

  for (
    let i = 1;
    i < maxAttempts && stepExecutionResult.status === "FAILED";
    i++
  ) {
    stepExecutionResult = await operation();
  }

  return stepExecutionResult;
}
