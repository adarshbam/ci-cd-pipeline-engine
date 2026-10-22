export interface GitHubPushInfo {
  repository: string;
  branch: string;
  commitSha: string;
}

// Helper: checks if an unknown value is a regular object
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function extractGitHubPush(payload: unknown): GitHubPushInfo {
  // 1. Validate top-level object
  if (!isRecord(payload)) {
    throw new Error("Invalid payload");
  }

  // 2. Validate repository
  const repository = payload.repository;

  if (
    !isRecord(repository) ||
    typeof repository.full_name !== "string" ||
    !repository.full_name.trim()
  ) {
    throw new Error("Invalid repository");
  }

  // 3. Validate branch
  const ref = payload.ref;

  if (typeof ref !== "string" || !ref.startsWith("refs/heads/")) {
    throw new Error("Invalid branch ref");
  }

  const branch = ref.slice("refs/heads/".length);

  if (!branch) {
    throw new Error("Empty branch name");
  }

  // 4. Reject deleted branch
  if (payload.deleted === true) {
    throw new Error("Deleted branch");
  }

  // 5. Validate commit SHA
  const commitSha = payload.after;

  if (typeof commitSha !== "string" || !/^[a-fA-F0-9]{40}$/.test(commitSha)) {
    throw new Error("Invalid commit SHA");
  }

  // 6. Return properly typed data
  return {
    repository: repository.full_name,
    branch,
    commitSha,
  };
}
