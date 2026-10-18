export interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  error?: string;
  durationMs: number;
}

export async function checkHealth(
  url: string,
  timeoutMs = 3000,
): Promise<HealthCheckResult> {
  // Configuration validation
  const parsedUrl = new URL(url);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Invalid URL protocol");
  }

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid timeout");
  }

  const started = Date.now();

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    return {
      healthy: res.ok,
      statusCode: res.status,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      healthy: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}
