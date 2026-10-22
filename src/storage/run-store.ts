import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type {
  Environment,
  JobRun,
  PipelineRun,
  PipelineStatus,
  Workflow,
} from "../workflow/workflow.js";

export interface StoredJobRun extends Omit<JobRun, "startedAt" | "finishedAt"> {
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
}

export interface StoredRun {
  id: string;
  pipelineId: string;
  status: PipelineStatus;
  createdAt: string;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  branch?: string | undefined;
  environment?: Environment | undefined;
  jobs: Record<string, StoredJobRun>;
  workflow: Workflow;
}

const DEFAULT_STORAGE_DIR = path.resolve("runtime/history/runs");

export async function ensureRunStorageDir(storageDir = DEFAULT_STORAGE_DIR): Promise<string> {
  await mkdir(storageDir, { recursive: true });
  return storageDir;
}

export function serializeRun(run: PipelineRun): StoredRun {
  const serializedJobs: Record<string, StoredJobRun> = {};
  if (run.jobs) {
    for (const [jobId, job] of Object.entries(run.jobs)) {
      serializedJobs[jobId] = {
        ...job,
        startedAt: job.startedAt
          ? job.startedAt instanceof Date
            ? job.startedAt.toISOString()
            : String(job.startedAt)
          : undefined,
        finishedAt: job.finishedAt
          ? job.finishedAt instanceof Date
            ? job.finishedAt.toISOString()
            : String(job.finishedAt)
          : undefined,
      };
    }
  }

  return {
    id: run.id,
    pipelineId: run.pipelineId,
    status: run.status,
    createdAt:
      run.createdAt instanceof Date
        ? run.createdAt.toISOString()
        : String(run.createdAt),
    startedAt: run.startedAt
      ? run.startedAt instanceof Date
        ? run.startedAt.toISOString()
        : String(run.startedAt)
      : undefined,
    finishedAt: run.finishedAt
      ? run.finishedAt instanceof Date
        ? run.finishedAt.toISOString()
        : String(run.finishedAt)
      : undefined,
    branch: run.branch,
    environment: run.environment,
    jobs: serializedJobs,
    workflow: run.workflow,
  };
}

export async function saveRun(run: PipelineRun, storageDir = DEFAULT_STORAGE_DIR): Promise<void> {
  try {
    await ensureRunStorageDir(storageDir);
    const filePath = path.join(storageDir, `${run.id}.json`);
    const tempPath = path.join(
      storageDir,
      `${run.id}.${randomBytes(4).toString("hex")}.tmp`,
    );
    const serialized = serializeRun(run);
    const content = JSON.stringify(serialized, null, 2);

    await writeFile(tempPath, content, "utf8");
    try {
      await rename(tempPath, filePath);
    } catch {
      // Fallback for Windows lock contention: direct atomic overwrite & unlink tmp
      await writeFile(filePath, content, "utf8");
      await unlink(tempPath).catch(() => {});
    }
  } catch (error) {
    console.error(`[RunStore] Failed to persist run ${run.id}:`, error);
  }
}

export async function loadAllStoredRuns(storageDir = DEFAULT_STORAGE_DIR): Promise<StoredRun[]> {
  try {
    await ensureRunStorageDir(storageDir);
    const entries = await readdir(storageDir, { withFileTypes: true });
    const runFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));
    const runs: StoredRun[] = [];

    for (const file of runFiles) {
      const fullPath = path.join(storageDir, file.name);
      try {
        const raw = await readFile(fullPath, "utf8");
        const parsed = JSON.parse(raw) as StoredRun;

        // Honest Crash / Restart Recovery:
        // Any run left in RUNNING or QUEUED state could not have finished.
        // Recover it honestly as FAILED with an explicit failure reason.
        if (parsed.status === "RUNNING" || parsed.status === "QUEUED") {
          console.warn(`[RunStore] Recovering interrupted run ${parsed.id} (${parsed.pipelineId}) -> FAILED`);
          parsed.status = "FAILED";
          parsed.finishedAt = new Date().toISOString();

          if (parsed.jobs) {
            for (const [jobId, job] of Object.entries(parsed.jobs)) {
              if (job.status === "RUNNING" || job.status === "QUEUED") {
                job.status = "FAILED";
                job.failureReason = "Execution interrupted by server restart or crash";
                job.finishedAt = new Date().toISOString();
              }
            }
          }

          // Persist the recovered status back to disk
          await writeFile(fullPath, JSON.stringify(parsed, null, 2), "utf8");
        }

        runs.push(parsed);
      } catch (err) {
        console.error(`[RunStore] Failed to read run file ${file.name}:`, err);
      }
    }

    // Return sorted newest first
    runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return runs;
  } catch (error) {
    console.error("[RunStore] Failed to load stored runs:", error);
    return [];
  }
}

export async function getStoredRun(runId: string, storageDir = DEFAULT_STORAGE_DIR): Promise<StoredRun | undefined> {
  try {
    if (!/^[a-zA-Z0-9_-]+$/.test(runId)) return undefined;
    const filePath = path.join(storageDir, `${runId}.json`);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as StoredRun;
  } catch {
    return undefined;
  }
}
