# Portfolio demonstration

A 3–5 minute walkthrough of the implemented path:

**GitHub push → signed validation → workflow selection → DAG scheduling → jobs and artifacts → GitHub commit status.**

Start with the credential-free local demonstration. Use the live variant only when you have a configured repository webhook and a private token. The local variant uses a synthetic push and a mock GitHub status API; the engine, job processes, dependency graph, artifact transfer, and HTTP read APIs are real in both variants.

## 1. Prepare and verify

From the repository root, with Node.js 24, npm, Git, and Bash installed:

```bash
npm ci
bash -lc "node --version"
npx tsc --noEmit
npm run build
```

On Windows PowerShell, make Git Bash the `bash` found by child processes if necessary:

```powershell
$env:PATH = 'C:\Program Files\Git\bin;' + $env:PATH
bash -lc "node --version"
```

The engine explicitly spawns `bash`; the Windows WSL launcher alone is not sufficient. The demo workflow also uses `mkdir`, `sleep`, and `grep` from the Bash environment.

## 2. Run the complete local demo

```bash
node --import tsx src/tools/portfolio-demo.ts
```

No server or `.env` setup is required. The script loads the existing `workflows/day7-live-github.json`, mounts only that workflow with the existing router, and starts two short-lived loopback servers on automatically assigned ports. It overrides any inherited GitHub credentials with local fake values in its own process and generates a random signing secret. It sends no requests to GitHub.

The script asserts this sequence:

1. A bad HMAC receives 401 and starts no run. A correctly signed but unselected branch receives 200 and starts no run.
2. A correctly signed `main` push for the configured repository receives a 200 delivery acknowledgement. The mock status API receives `pending` before execution starts.
3. Build creates `dist/release.txt` containing `Release ready`, then stores it as `release-bundle`.
4. The unit and integration sample jobs are observed `RUNNING` together after build succeeds, with deploy still `QUEUED`.
5. Deploy restores build's artifact into its own temporary directory; `grep` checks the contents. All four jobs and the pipeline reach `SUCCESS`.
6. The mock API receives `success`; status and log APIs expose the completed run; metrics show one success and zero active runs.
7. Reposting the same delivery ID returns 200 without a second run or extra status reports.

Expected final output (IDs and paths vary):

```text
Mock GitHub commit status: pending (custom-ci/pipeline)
Mock GitHub commit status: success (custom-ci/pipeline)
Run: <run-id> — SUCCESS; all four jobs succeeded; parallel jobs observed.
Artifact stored and verified by deploy; duplicate delivery did not rerun.
Evidence: <repository>/runtime/portfolio-demo-<unique-suffix>
PASS — webhook → signature → selection → DAG → artifact → pending/success
```

Each invocation keeps a new evidence directory and closes both servers. Inspect `summary.json`, `runtime/logs/<run-id>.jsonl`, and `runtime/artifacts/<run-id>/build/release-bundle` inside the printed directory. No existing run data is overwritten. Because POST acknowledgements do not contain a run ID and there is no run-list endpoint, the script discovers its run ID from the single log in its isolated evidence directory, then uses the real run/log HTTP APIs.

For the failure side of the story, run these existing tests:

```bash
node --import tsx src/tests/day7-failure-drills.test.ts
node --import tsx src/tests/day7-health-rollback.test.ts
node --import tsx src/tests/day7-github-full-integration.test.ts
```

They exercise failed prerequisites and skipped dependents, corrupted artifacts, unhealthy checks with rollback, and `pending → failure` reporting to a mock API. Intentional failure messages are expected; the test process must still exit zero.

## 3. Presentation script

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:30 | README and architecture | “This is a small TypeScript CI/CD engine. A signed push selects a local workflow, schedules dependent jobs, transfers artifacts, and reports commit status.” |
| 0:30–1:00 | `day7-live-github.json` | “This endpoint accepts pushes for this repository on main. Build fans out to two sample test jobs; deploy waits for all three prerequisites and consumes the build artifact.” |
| 1:00–2:00 | Run `src/tools/portfolio-demo.ts` | “This local run uses a synthetic signed push and a mock GitHub API. The webhook router, Bash jobs, scheduling, and artifact copies are the actual implementation. An invalid signature is rejected before the pipeline starts.” |
| 2:00–3:00 | Printed evidence: summary, artifact, lifecycle log | “Both test jobs overlapped. Deploy restored and checked the file in its own job directory. The mock received pending then success, and replaying the delivery did not create another run.” |
| 3:00–4:00 | Failure test result or live GitHub delivery/status | “Failed prerequisites skip dependents while independent work finishes. Health-check failures can run configured rollback. In the live version, GitHub receives the same status requests.” |
| 4:00–4:30 | README boundaries | “The sample build and deployment are simulated. Execution is on the host, state tracking is in memory, and production work would need durable state, protected APIs, stronger isolation, and real checkout/build/deploy integration.” |

Do not call the sample sleep/echo commands an application's real test suite. Do not present a mock status as a live GitHub result. The verification record identifies which steps were actually rerun.

## 4. Optional real GitHub demonstration

This uses the checked-in workflow's exact repository `adarshbam/ci-cd-pipeline-engine` and branch `main`. It requires webhook administration for that repository, a token restricted to the repository with **Commit statuses: Read and write**, a public HTTPS tunnel, and a fresh commit ready to push. The local demo above requires none of these.

### Terminal A: process environment and server

Use private process environment values. The following are placeholders; replace them locally without pasting real values into docs, recordings, or chat. Do not edit `.env` for this procedure.

PowerShell:

```powershell
$env:PATH = 'C:\Program Files\Git\bin;' + $env:PATH
$env:PORT = '4000'
$env:GITHUB_WEBHOOK_SECRET = '<shared-random-webhook-secret>'
$env:GITHUB_TOKEN = '<fine-grained-token-with-commit-status-write>'
Remove-Item Env:GITHUB_API_BASE_URL -ErrorAction SilentlyContinue
npm start
```

Bash alternative:

```bash
export PORT=4000
export GITHUB_WEBHOOK_SECRET='<shared-random-webhook-secret>'
export GITHUB_TOKEN='<fine-grained-token-with-commit-status-write>'
unset GITHUB_API_BASE_URL
npm start
```

The server loads all bundled workflows on startup. Its read APIs and some sample GET triggers have no authentication; keep read access local and protect any public exposure. This is not a production deployment.

### Terminal B: tunnel and GitHub webhook

```bash
ngrok http 4000
```

In the repository's webhook settings, configure:

| Setting | Value |
| --- | --- |
| Payload URL | `https://<your-tunnel-host>/webhooks/day7-live-github` |
| Content type | `application/json` |
| Secret | The same private value as `GITHUB_WEBHOOK_SECRET` |
| Event | Push |
| SSL verification | Enabled |

The endpoint is POST only. Keep status/log/metrics access local or behind access control; a plain tunnel publishes the server's other routes too. Do not expose a development listener beyond the controlled demonstration.

### Terminal C: verify before pushing

Use a clean `main` checkout whose HEAD is the fresh commit you intend to push. Prepare/review that commit **before starting the verifier**: it captures HEAD at startup. A push that says “Everything up-to-date” does not create a new delivery. This guide does not require an empty commit or edits to existing work.

Set `GITHUB_TOKEN` privately in this terminal as well. Then:

PowerShell:

```powershell
$env:DAY7_LIVE_BASE_URL = 'http://127.0.0.1:4000'
$env:GITHUB_TOKEN = '<fine-grained-token-with-commit-status-write>'
node --import tsx src/tests/day7-live-webhook.test.ts
```

Bash alternative:

```bash
export DAY7_LIVE_BASE_URL='http://127.0.0.1:4000'
export GITHUB_TOKEN='<fine-grained-token-with-commit-status-write>'
node --import tsx src/tests/day7-live-webhook.test.ts
```

After `READY FOR REAL GITHUB PUSH`, in another terminal at the **same checkout and HEAD**:

```bash
git push origin main
```

Avoid unrelated pushes/redeliveries during the verifier's window. It checks for exactly one additional completed successful run and polls GitHub for both `pending` and `success` on the captured SHA under `custom-ci/pipeline`. It can wait up to three minutes for a pipeline and another three minutes for status history. Use a fresh SHA to avoid confusing older status history with this run.

Show GitHub's Recent Deliveries: the POST returns 200 with `received`, `event`, and `deliveryId`. Show the commit status `custom-ci/pipeline` finishing as `success`. An HTTP 200 alone is insufficient: filtered pushes and duplicates also receive 200.

The broader existing `day7-full-release.test.ts` performs local workflow checks and then requires another live push, so run it in its own verification window:

```bash
node --import tsx src/tests/day7-full-release.test.ts
```

It uses the same token/base URL environment and captures HEAD before asking for the push. Neither live test was executed for this documentation update.

### Run, log, metric and artifact evidence

Use metrics at `http://127.0.0.1:4000/webhooks/day7-live-github/metrics`. For a live POST, identify the new UUID log file under `runtime/logs/` during a quiet demo window; there is no HTTP run-list or delivery-to-run lookup. With that ID:

```bash
curl 'http://127.0.0.1:4000/webhooks/day7-live-github/runs/<run-id>'
curl 'http://127.0.0.1:4000/webhooks/day7-live-github/runs/<run-id>/logs?limit=100&offset=0'
curl 'http://127.0.0.1:4000/webhooks/day7-live-github/metrics'
```

Use `curl.exe` on Windows PowerShell if `curl` is an alias. The stored artifact is `runtime/artifacts/<run-id>/build/release-bundle` (a file, despite the bundle name). Logs record lifecycle/failure messages; successful step output is not streamed through the log API.

### Troubleshooting and finish

| Symptom | Check |
| --- | --- |
| 503 | Server process has no webhook secret |
| 401 | GitHub and server secrets differ, or signed bytes were modified |
| 400 / 415 | Required GitHub headers/push payload, or JSON content type |
| 200 with no new run | Event, exact allowlisted repository/branch, delivery ID, and workflow path |
| 500 before a run appears | Pending status API call may have failed; inspect token permissions and server error |
| Run fails | Read job `failureReason`, lifecycle logs, Bash availability and artifact path |
| Run succeeds but GitHub stays pending | Final status request may have failed; the engine does not retry it automatically |
| Verifier times out | Fresh commit actually pushed, tunnel/webhook path, captured HEAD, and correct base URL |

Stop the server/tunnel and disable a temporary webhook when finished. Close the credential-bearing terminals or remove their temporary environment values. Demo evidence is retained under ignored `runtime/`; keep only the recordings/files you intend to share.
