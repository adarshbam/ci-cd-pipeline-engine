import type { Environment } from "../workflow/workflow.js";
import type { HealthCheckResult } from "./health-checker.js";
import type { HealthRetryOptions } from "./health-retry.js";
import {
  checkEnvironmentHealth,
  type EnvironmentHealthConfig,
} from "./environment-health.js";

export async function deployAndCheckHealth(
  deployment: () => Promise<void>,
  environment: Environment,
  configurations: EnvironmentHealthConfig,
  options: HealthRetryOptions = {},
): Promise<HealthCheckResult> {
  try {
    await deployment();
    return await checkEnvironmentHealth(environment, configurations, options);
  } catch (err) {
    throw err;
  }
}
