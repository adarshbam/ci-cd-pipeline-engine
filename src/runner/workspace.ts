import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createWorkspace(): Promise<string> {
  // Create a unique temporary directory.
  const workspace = await mkdtemp(join(tmpdir(), "ci-run-"));

  return workspace;
}

export async function withWorkspace<T>(
  operation: (cwd: string) => Promise<T>,
): Promise<T> {
  // Your implementation
  const workspacePath = await createWorkspace();
  try {
    return await operation(workspacePath);
  } finally {
    await rm(workspacePath, {
      recursive: true,
      force: true,
    });
  }
}
