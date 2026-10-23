import { cp, lstat, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";

export async function initializeArtifactStorage(): Promise<string> {
  const fullPath = resolve(process.cwd(), "runtime", "artifacts");
  await mkdir(fullPath, { recursive: true });

  return fullPath;
}

export async function getArtifactPath(
  runId: string,
  jobId: string,
  artifactName: string,
): Promise<string> {
  const storageRoot = await initializeArtifactStorage();

  validateArtifactIdentifier(runId);
  validateArtifactIdentifier(jobId);
  validateArtifactIdentifier(artifactName);
  const fullUniquePath = resolve(storageRoot, runId, jobId, artifactName);

  return fullUniquePath;
}

export async function saveArtifact(
  runId: string,
  jobId: string,
  artifactName: string,
  sourcePath: string,
): Promise<string> {
  const destinationPath = await getArtifactPath(runId, jobId, artifactName);

  try {
    await lstat(destinationPath);

    // If lstat succeeds, the destination already exists.
    throw new Error("Artifact already exists");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // Destination doesn't exist. Safe to proceed.
    } else {
      throw error;
    }
  }

  await mkdir(dirname(destinationPath), { recursive: true });

  await cp(sourcePath, destinationPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });

  return destinationPath;
}

export async function restoreArtifact(
  runId: string,
  jobId: string,
  artifactName: string,
  destinationPath: string,
): Promise<void> {
  const sourcePath = await getArtifactPath(runId, jobId, artifactName);

  try {
    await lstat(sourcePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("Artifact doesn't exist");
    } else {
      throw error;
    }
  }

  await mkdir(dirname(destinationPath), { recursive: true });

  await cp(sourcePath, destinationPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
}

export function validateArtifactIdentifier(value: string): void {
  const SAFE_NAME_REGEX = /^(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/;

  if (!SAFE_NAME_REGEX.test(value)) {
    throw new Error("Path traversal detected");
  }
}

export interface ArtifactInfo {
  id: string;
  runId: string;
  jobId: string;
  name: string;
  size: string;
  sizeBytes: number;
  type: string;
  isDirectory: boolean;
  createdAt: string;
  sha256: string;
  downloadUrl: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function calculateSha256(filePath: string): Promise<string> {
  try {
    const data = await readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return "";
  }
}

export async function listRunArtifacts(runId: string): Promise<ArtifactInfo[]> {
  validateArtifactIdentifier(runId);
  const storageRoot = await initializeArtifactStorage();
  const runDir = resolve(storageRoot, runId);

  try {
    const jobEntries = await readdir(runDir, { withFileTypes: true });
    const artifacts: ArtifactInfo[] = [];

    for (const jobEntry of jobEntries) {
      if (!jobEntry.isDirectory()) continue;
      const jobId = jobEntry.name;
      try {
        validateArtifactIdentifier(jobId);
      } catch {
        continue;
      }
      const jobDir = resolve(runDir, jobId);
      const artEntries = await readdir(jobDir, { withFileTypes: true });

      for (const artEntry of artEntries) {
        const artifactName = artEntry.name;
        try {
          validateArtifactIdentifier(artifactName);
        } catch {
          continue;
        }
        const fullPath = resolve(jobDir, artifactName);
        const stats = await stat(fullPath);

        let artType = "binary";
        if (stats.isDirectory()) {
          artType = "directory";
        } else if (artifactName.endsWith(".tar.gz") || artifactName.endsWith(".tar")) {
          artType = "tar";
        } else if (artifactName.endsWith(".zip")) {
          artType = "zip";
        } else if (
          artifactName.endsWith(".json") ||
          artifactName.endsWith(".txt") ||
          artifactName.endsWith(".log") ||
          artifactName.endsWith(".html")
        ) {
          artType = "report";
        }

        const sha = stats.isFile() ? await calculateSha256(fullPath) : "";

        artifacts.push({
          id: `${runId}-${jobId}-${artifactName}`,
          runId,
          jobId,
          name: artifactName,
          size: formatFileSize(stats.size),
          sizeBytes: stats.size,
          type: artType,
          isDirectory: stats.isDirectory(),
          createdAt: stats.mtime.toISOString(),
          sha256: sha,
          downloadUrl: `/api/runs/${runId}/artifacts/${jobId}/${artifactName}/download`,
        });
      }
    }
    return artifacts;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function listAllArtifacts(): Promise<ArtifactInfo[]> {
  const storageRoot = await initializeArtifactStorage();
  try {
    const runDirs = await readdir(storageRoot, { withFileTypes: true });
    const all: ArtifactInfo[] = [];

    for (const entry of runDirs) {
      if (!entry.isDirectory()) continue;
      const runId = entry.name;
      try {
        const runArtifacts = await listRunArtifacts(runId);
        all.push(...runArtifacts);
      } catch {
        // Skip malformed/invalid dir
      }
    }

    all.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return all;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
