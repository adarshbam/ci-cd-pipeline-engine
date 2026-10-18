export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface ExecutionLogEntry {
  timestamp: string;
  runId: string;
  jobId?: string;
  level: LogLevel;
  message: string;
}

export function createLogEntry(
  input: Omit<ExecutionLogEntry, "timestamp">,
): ExecutionLogEntry {
  // Validate message
  if (!input.message || !input.message.trim()) {
    throw new Error("Log message required");
  }

  // Validate runId
  if (!input.runId || !input.runId.trim()) {
    throw new Error("RunId is required");
  }

  // Validate log level
  if (
    input.level !== "INFO" &&
    input.level !== "WARN" &&
    input.level !== "ERROR"
  ) {
    throw new Error("Invalid log level entry");
  }

  // Create a new log entry
  return {
    ...input,
    timestamp: new Date().toISOString(),
  };
}
