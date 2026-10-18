import type { Environment } from "../workflow/workflow.js";
import type { HealthCheckResult } from "./health-checker.js";
import {
  checkHealthWithRetries,
  type HealthRetryOptions,
} from "./health-retry.js";

export interface EnvironmentHealthConfig {
  test?: {
    healthUrl?: string;
  };
  prod?: {
    healthUrl?: string;
  };
}

export async function checkEnvironmentHealth(
  environment: Environment,
  configurations: EnvironmentHealthConfig,
  options: HealthRetryOptions = {},
): Promise<HealthCheckResult> {
  let testHealthUrl;
  if (environment === "TEST") {
    testHealthUrl = configurations.test?.healthUrl;
  } else if (environment === "PROD") {
    testHealthUrl = configurations.prod?.healthUrl;
  } else {
    throw new Error("Invalid environment!");
  }
  if (!testHealthUrl?.trim()) {
    throw new Error("Environment health check URL is missing!");
  }
  return await checkHealthWithRetries(testHealthUrl, options);
}
