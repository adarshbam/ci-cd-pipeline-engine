export function validateTimeoutMs(timeoutMs: number | undefined): void {
  if (timeoutMs === undefined) return;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid timeout value");
  }
}
