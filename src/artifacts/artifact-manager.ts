import { cp, lstat, mkdir } from "node:fs/promises";
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

function validateArtifactIdentifier(value: string): void {
  const SAFE_NAME_REGEX = /^(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/;

  if (!SAFE_NAME_REGEX.test(value)) {
    throw new Error("Path traversal detected");
  }
}
