export interface RollbackResult {
  status: "SUCCESS" | "FAILED";
  durationMs: number;
  error?: string;
}

export async function executeRollback(
  rollback: () => Promise<void>,
): Promise<RollbackResult> {
  const startTime = Date.now();

  try {
    await rollback();

    return { status: "SUCCESS", durationMs: Date.now() - startTime };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "FAILED",
      durationMs: Date.now() - startTime,
      error: message,
    };
  }
}
