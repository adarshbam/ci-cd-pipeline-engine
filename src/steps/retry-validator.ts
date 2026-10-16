export function validateRetries(retries: number | undefined): void {
  if (retries === undefined) return;
  if (!Number.isSafeInteger(retries) || retries < 0 || retries > 10) {
    throw new Error("Invalid timeout value");
  }
}
