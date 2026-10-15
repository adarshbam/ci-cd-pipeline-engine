import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolveWorkspaceArtifactPath(
  workspacePath: string,
  artifactPath: string,
): string {
  // 1. Reject empty and absolute artifact paths
  if (!artifactPath.trim() || isAbsolute(artifactPath)) {
    throw new Error("Artifact path must be relative and non-empty");
  }

  // 2. Resolve both paths
  const workspaceRoot = resolve(workspacePath);
  const resolvedPath = resolve(workspaceRoot, artifactPath);

  // 3. Determine where the artifact is relative to the workspace
  const relativePath = relative(workspaceRoot, resolvedPath);

  // 4. Reject paths outside the workspace or pointing to its root
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Artifact path escapes the workspace");
  }

  // 5. Return the safe resolved path
  return resolvedPath;
}
