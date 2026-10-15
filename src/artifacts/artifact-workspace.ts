import { join } from "node:path";
import { withWorkspace } from "../runner/workspace.js";
import { restoreArtifact, saveArtifact } from "./artifact-manager.js";

export async function buildAndStoreArtifact(
  runId: string,
  jobId: string,
  artifactName: string,
  operation: (workspacePath: string) => Promise<string>,
): Promise<string> {
  return await withWorkspace(async (cwd) => {
    const artifactPath = await operation(cwd);

    return saveArtifact(runId, jobId, artifactName, artifactPath);
  });
}

export async function withRestoredArtifact<T>(
  runId: string,
  sourceJobId: string,
  artifactName: string,
  operation: (workspacePath: string, restoredPath: string) => Promise<T>,
): Promise<T> {
  return await withWorkspace(async (cwd) => {
    const restoredPath = join(cwd, "artifacts", artifactName);
    await restoreArtifact(runId, sourceJobId, artifactName, restoredPath);
    return await operation(cwd, restoredPath);
  });
}
