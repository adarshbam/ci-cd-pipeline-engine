import { readFile } from "node:fs/promises";
import type { ExecutionLogEntry, LogLevel } from "./log-entry.js";
import { join } from "node:path";

export interface LogQuery {
  level?: LogLevel;
  jobId?: string;
}

export async function readLogEntries(
  runId: string,
  options: LogQuery = {},
  directory: string = "runtime/logs",
): Promise<ExecutionLogEntry[]> {
  const runIdRegex = /^[a-zA-Z0-9_-]+$/;

  if (!runIdRegex.test(runId)) throw new Error("Invalid run ID");

  const runFilePath = join(directory, `${runId}.jsonl`);

  try {
    const logFile = await readFile(runFilePath, "utf8");

    const logs: ExecutionLogEntry[] = logFile
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as ExecutionLogEntry);

    const filtered = logs.filter((log) => {
      const levelMatches =
        options.level === undefined || log.level === options.level;

      const jobMatches =
        options.jobId === undefined || log.jobId === options.jobId;

      return levelMatches && jobMatches;
    });

    return filtered;
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return [];
    }

    throw err;
  }
}
