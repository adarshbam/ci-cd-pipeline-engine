export type GitHubCommitState = "pending" | "success" | "failure" | "error";

export interface GitHubCommitStatusInput {
  repository: string;
  commitSha: string;
  state: GitHubCommitState;
  token: string;

  description?: string;
  context?: string;
  targetUrl?: string;

  // Allows tests to target a local mock server.
  apiBaseUrl?: string;
}

export async function reportGitHubCommitStatus(
  input: GitHubCommitStatusInput,
): Promise<void> {
  const { token, repository, commitSha } = input;

  if (!token || !token.trim()) {
    throw new Error("GitHub token cannot be empty");
  }

  const repoRegex = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

  if (!repoRegex.test(repository) || repository.includes("..")) {
    throw new Error("Invalid repository format");
  }

  const shaRegex = /^[a-fA-F0-9]{40}$/;

  if (!shaRegex.test(commitSha)) {
    throw new Error("Invalid commit SHA");
  }

  const commitApiURl = `${input.apiBaseUrl ?? "https://api.github.com"}/repos/${repository}/statuses/${input.commitSha}`;

  const res = await fetch(commitApiURl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      state: input.state,
      description: input.description,
      context: input.context,
      target_url: input.targetUrl,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `GitHub API request failed: ${res.status} ${res.statusText}`,
    );
  }
}
