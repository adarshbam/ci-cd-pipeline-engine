# Custom CI/CD Pipeline Engine — Release Guide

For a credential-free walkthrough and a concise presentation script, start with
[DEMO.md](DEMO.md). See [ARCHITECTURE.md](ARCHITECTURE.md) for implemented behavior
and [VERIFICATION.md](VERIFICATION.md) for checks actually rerun and live steps
that remain unverified.

## 1. Overview

A custom TypeScript/Node.js CI/CD engine supporting:

- GitHub push webhooks with HMAC-SHA256 verification
- Repository and branch filtering
- Webhook delivery deduplication
- DAG-based job scheduling
- Independent and parallel job execution
- Isolated job workspaces
- Build artifact uploads and downloads
- TEST and PROD environment routing
- Health checks and rollback execution
- Pipeline status, logs and metrics APIs
- GitHub pending, success and failure commit statuses

## 2. Requirements

- Node.js 24 or a verified compatible version
- npm dependencies installed
- Git
- Bash-compatible environment for command execution
- ngrok for locally hosted webhook testing
- GitHub repository with webhook access

On Windows, ensure Bash is available to the process runner.

## 3. Install

From the project root:

```bash
npm ci
npx tsc --noEmit
npx tsc
```

## 4. Environment Configuration

Use process environment variables as shown in [DEMO.md](DEMO.md). No `.env`
creation or editing is required. `.env.example` documents the variable names
with safe placeholders.

Set the following:

- `PORT`: HTTP server port (default `3000`; use `4000` for the examples below).
- `GITHUB_WEBHOOK_SECRET`: The GitHub webhook signing secret.
- `GITHUB_TOKEN`: Fine-grained GitHub token with Commit statuses read/write access.
- `DAY7_LIVE_BASE_URL`: URL used by live integration tests.

Leave `GITHUB_API_BASE_URL` unset for real GitHub; it is only needed for a mock
API. Do not commit `.env` or share credentials. The existing
`node --env-file=.env` mode remains available when you already maintain a private
environment file; the commands below use the launching terminal's environment.

## 5. Start the Server

Build the server:

```bash
npx tsc
```

Run it with the process environment configured:

```bash
npm start
```

Verify the actual server port in its startup logs.

The workflow loader must load the desired files from `workflows/`.

## 6. Configure GitHub Webhook

Start the local server first.

Expose its port using ngrok:

```bash
ngrok http 4000
```

Replace `4000` with your actual server port.

In the GitHub repository:

Settings > Webhooks > Add webhook

Use:

- Payload URL: `https://YOUR-NGROK-DOMAIN/webhooks/day7-live-github`
- Content type: `application/json`
- Secret: Same value as `GITHUB_WEBHOOK_SECRET`
- Events: Push
- Active: Enabled

Keep SSL verification enabled.

The live workflow accepts POST webhooks only.

## 7. Trigger a Live Verification

Start the server and ngrok.

Run the live verification test:

```bash
node --import tsx src/tests/day7-live-webhook.test.ts
```

Prepare and review a fresh commit on `main` before starting the verifier: it
captures HEAD at startup. When it prints `READY FOR REAL GITHUB PUSH`, push that
same commit. An up-to-date push does not trigger a new delivery.

Then push:

```bash
git push origin main
```

Verify:

1. GitHub reports successful webhook delivery.
2. Exactly one new pipeline executes.
3. The pipeline reaches SUCCESS.
4. The latest GitHub commit status reports success.

## 8. Full Release Smoke Test

Run the local release verification:

```bash
node --import tsx src/tests/day7-full-release.test.ts
```

This verifies:

- Build execution
- Parallel unit and integration test jobs
- Artifact upload and download
- Deployment verification
- Live GitHub push integration
- Final GitHub commit status

Follow the test's instructions before pushing.

This is not a production deployment. The current capstone uses a sample release artifact and simulated deployment commands.

## 9. Recovery and Rollback

To verify expected failures:

```bash
npx tsx src/tests/day7-failure-drills.test.ts
npx tsx src/tests/day7-health-rollback.test.ts
npx tsx src/tests/rollback-final.test.ts
npx tsx src/tests/day7-resource-hardening.test.ts
```

Expected behavior includes:

- Failed builds block dependent jobs.
- Independent jobs are allowed to complete.
- Corrupted release artifacts fail verification.
- Failed deployment steps prevent subsequent steps.
- Rollback runs when configured and applicable.
- Job workspaces are cleaned up.
- Later independent pipelines remain executable.
- Pipeline metrics distinguish successes and failures.

These tests verify simulated failure handling. They do not establish recovery from process crashes, machine restarts, or external infrastructure outages.

## 10. Security Checklist

Before exposing the server:

- Keep `.env` out of version control.
- Never print GitHub tokens or webhook secrets.
- Validate GitHub webhook signatures before triggering jobs.
- Restrict accepted repositories and branches.
- Use POST-only routes for authenticated GitHub triggers.
- Prevent repeated delivery IDs from starting duplicate jobs.
- Validate artifact paths against workspace traversal.
- Run jobs with least-privilege operating system permissions.
- Keep GitHub tokens restricted to necessary repository permissions.
- Review access control for status, logs and metrics endpoints before exposing them publicly.
- Do not treat ngrok as an authentication or authorization mechanism.

Important: CI/CD workflows execute commands and should only be controlled by trusted configuration and authorized inputs.

## 11. Troubleshooting

### HTTP 404 on workflow endpoint

Ensure the workflow JSON is loaded and restart the server after adding workflow files.

### HTTP 415 on GitHub webhook

Check that GitHub sends `application/json`.

### HTTP 401 or invalid signature

Check the webhook secret and the original request body used for HMAC verification.

### GitHub status reporting fails

Verify `GITHUB_TOKEN`, its expiration, and Commit statuses write permission.

### Pipeline reports FAILED

Inspect the run's job statuses and logs.

### ngrok browser warning

The free ngrok browser warning is not itself a webhook verification failure. Inspect GitHub's Recent Deliveries and the actual HTTP response.

## 12. Final Validation

Run the Day 7 regression suite:

```bash
npx tsc --noEmit
npx tsx src/tests/day7-final-regression.test.ts
```

Do not publish a release if required test suites fail.

## 13. Known Limitations

- In-memory run and delivery tracking do not survive server restarts unless persistence is added.
- A local ngrok tunnel is suitable for development testing, not production infrastructure.
- Real deployment requires repository checkout, actual builds, deployment credentials and target environment integration.
- Further production hardening should include authentication, audit logging, durable queues and reliable restart recovery.
