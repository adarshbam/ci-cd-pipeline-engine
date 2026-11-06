# Demonstrating the engine

[Setup](SETUP.md) · [Architecture](ARCHITECTURE.md) · [Recorded verification](VERIFICATION.md)

There are two different demonstrations: a synthetic loopback flow and a real GitHub push. Keep their evidence distinct.

## Local loopback demonstration

After installing root dependencies, with Node.js 24 and Bash available:

```sh
node --import tsx src/tools/portfolio-demo.ts
```

The [script](../src/tools/portfolio-demo.ts) imports the real router/engine, creates a signed synthetic delivery, and starts a loopback mock GitHub status receiver. It uses generated local credentials and writes evidence beneath its own `runtime/portfolio-demo-*` directory. It does not need a real GitHub token or publish a status to GitHub.

Explain what the output establishes: a delivery reached the engine, the sample dependency graph ran, artifacts moved between job workspaces, and status requests reached the mock. It does not prove real provider delivery, production deployment, or performance at scale.

## Dashboard walkthrough

1. Start the backend and dashboard using [Setup](SETUP.md).
2. Inspect a workflow's commands and dependencies before triggering it.
3. Run a suitable local sample and inspect job states, logs, and declared artifacts.
4. Demonstrate a failed prerequisite and confirm descendants are skipped while independent jobs can finish.
5. If demonstrating cancellation, inspect actual process/job termination rather than relying only on a notification.

The [dashboard capture](screenshots/dashboard.webp) shows a local session, not a current test result or benchmark.

## Live GitHub push

Use your own authorized test repository and private credentials. Start the engine first; run ngrok separately for the actual API port, for example:

```sh
ngrok http 3000
```

A tunnel exposes a listener, not automatic route-level protection. Restrict public ingress to the intended signed POST webhook; legacy GET/read endpoints are not all protected. [Read the access boundary](ARCHITECTURE.md#access-and-exposure).

Set GitHub's webhook to `application/json`, push events, SSL verification enabled, and a secret matching `GITHUB_WEBHOOK_SECRET`. The payload URL is your tunnel base plus the selected workflow's configured `webhook.url`. For the bundled live example, inspect [day7-live-github.json](../workflows/day7-live-github.json), especially repository/branch restrictions.

The live verifier is:

```sh
npm run test:live
```

Configure `DAY7_LIVE_BASE_URL` to the local API address and supply the required token privately to the verifier. Prepare a real reviewed commit **before** starting it: the verifier captures HEAD. Follow its readiness output before pushing that exact commit. An up-to-date push does not create a new event. This guide does not require an empty/fake commit.

Confirm all three outcomes separately: webhook delivery, the intended engine run, and final status on the intended SHA. HTTP 200 alone is not enough; filtered and duplicate deliveries may also return200. A token reporting status does not prove workflow commands checked out the pushed repository.

## Troubleshooting

| Symptom | Inspect |
| --- | --- |
| 503 before execution | Missing server webhook secret |
| 401 signature failure | Matching secret and unchanged raw payload bytes |
| 400/415 | Required headers, push payload, and JSON content type |
| Acknowledgement without run | Workflow path, allowed repository/branch, event subscription, delivery ID |
| Failed run | Job failure reason, Bash, artifact dependencies, step output |
| Run finished but status stayed pending | Token permissions and final-report errors |
| Tunnel already running | Stop only your redundant tunnel; run it independently of watcher restarts |

Stop your temporary tunnel and disable the temporary webhook when finished. Keep private credentials and local runtime evidence out of recordings/public commits.
