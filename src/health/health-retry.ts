import { setTimeout as sleep } from "node:timers/promises";
import { checkHealth, type HealthCheckResult } from "./health-checker.js";

export interface HealthRetryOptions {
  retries?: number;
  delayMs?: number;
  timeoutMs?: number;
}

export async function checkHealthWithRetries(
  url: string,
  options: HealthRetryOptions = {},
): Promise<HealthCheckResult> {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 100;
  const timeoutMs = options.timeoutMs ?? 3000;

  // Validate configuration
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new Error("Invalid retries");
  }

  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new Error("Invalid retry delay");
  }

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid timeout");
  }

  // Initial attempt + configured retries
  let result = await checkHealth(url, timeoutMs);

  for (let attempt = 0; attempt < retries && !result.healthy; attempt++) {
    await sleep(delayMs);
    result = await checkHealth(url, timeoutMs);
  }

  return result;
}
