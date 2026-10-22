export function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN;

  if (!token?.trim()) {
    // Throw an error
    throw new Error("Missing or invalid GITHUB_TOKEN");
  }

  return token.trim();
}
