import { appendFile, mkdir } from "node:fs/promises";
import type { ExecutionLogEntry } from "./log-entry.js";
import { join } from "node:path";

export async function appendLogEntry(
  entry: ExecutionLogEntry,
  directory: string = "runtime/logs",
): Promise<void> {
  const runIdRegex = /^[a-zA-Z0-9_-]+$/;

  if (!runIdRegex.test(entry.runId)) throw new Error("Invalid run ID");

  await mkdir(directory, { recursive: true });

  const runFilePath = join(directory, `${entry.runId}.jsonl`);

  const serializedEntry = JSON.stringify(entry) + "\n";
  await appendFile(runFilePath, serializedEntry);
}
