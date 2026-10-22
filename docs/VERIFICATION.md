# Verification record

Verified on **22 October 2026 (Asia/Calcutta)** against `main` at base commit **`3b11ca0b185c82744f3c5298608185db77a89c52`**, followed by the documentation and standalone demo in this change. This record reports observed checks, not a claim that every historical exercise or test file passed.

## Environment and scope

- Windows, Node.js `v24.11.1`, npm `11.15.0`, with `C:\Program Files\Git\bin` prepended to `PATH` for Git Bash.
- Clean fresh checkout inspected before edits: README, workflow JSONs, execution/router/storage code, tests, schema, package scripts, `.env.example`, and `docs/RELEASE.md`.
- No `AGENTS.md` or `.github/workflows/` files were present in this checkout. No `npm test` script exists. The JSON workflows under `workflows/` are inputs to this engine, not GitHub Actions automation.
- No `.env` was read, created, or edited. No real GitHub token or webhook secret was needed for executed checks. Mock-based suites configure their own local credentials and servers.
- Existing application source, workflow definitions, package scripts/dependencies, and lockfile were left unchanged. The new `src/tools/portfolio-demo.ts` is a standalone demonstration that imports the existing implementation.

## Commands and observed results

Run from the repository root. On Windows first select Git Bash:

```powershell
$env:PATH = 'C:\Program Files\Git\bin;' + $env:PATH
```

| Exact command | Observed result | What it establishes |
| --- | --- | --- |
| `npm ci` | PASS; 104 packages added, npm reported 0 vulnerabilities at install time | Locked dependencies installed; not a security guarantee |
| `npx tsc --noEmit` | PASS | TypeScript compilation, including the standalone demo |
| `npm run build` | PASS | Emits the existing application and test files under `dist/` |
| `node --import tsx src/tests/day7-final-regression.test.ts` | PASS, **29/29 suites**, 6/6 groups | Listed regression coverage below |
| `node --import tsx src/tests/day7-release-smoke.test.ts` | PASS, 6 printed checks | Sample release DAG, artifact consumption, completion and metrics |
| `node --import tsx src/tests/day7-failure-drills.test.ts` | PASS, 6 printed checks | Build/test/deploy failures, corrupted artifact, skipped dependents, independent work and later runs |
| `node --import tsx src/tests/day7-release-readiness.test.ts` | PASS, 6 printed checks | Environment template, ignored secrets file, live workflow restrictions, references and release documentation |
| `node --import tsx src/tests/timeout-final.test.ts` | PASS, 2 printed checks | Script timeout and dependent-job failure propagation |
| `node --import tsx src/tests/retry-failure-propagation.test.ts` | PASS, 4 printed checks | Retry bounds, stop after failure, recovery and invalid retry rejection |
| `node --import tsx src/tests/rollback-final.test.ts` | PASS, 6 printed checks | Healthy/unhealthy outcomes, rollback result preservation and independent-run recovery |
| `node --import tsx src/tools/portfolio-demo.ts` | PASS | Signed synthetic HTTP push through the real live-workflow DAG, parallel jobs, stored/restored artifact, read APIs, duplicate suppression and local mock `pending → success` requests |

The first restricted execution could not connect to loopback test servers (`EACCES`) and could not reliably execute Bash children. The build and full 29-suite regression were rerun with local process/network access and passed. Those initial environment failures were not treated as product regressions or silently counted as successful runs.

## Regression runner inventory

These are the 29 files explicitly scheduled by `day7-final-regression.test.ts`; this is not a wildcard sweep of every repository test.

| Group | Suites (all names end in `.test.ts`) | Result |
| --- | --- | --- |
| Workflow configuration and schema | `day7-workflow-config`, `day7-schema-compatibility`, `day7-github-payload` | 3/3 |
| GitHub security and deduplication | `day7-github-webhook`, `day7-webhook-input-hardening`, `day7-github-trigger`, `day7-github-deduplication`, `day7-dedup-hardening`, `day7-workflow-isolation`, `day7-github-credentials` | 7/7 |
| Commit status lifecycle | `day7-github-commit-status`, `day7-github-final-status`, `day7-github-reporting-robustness`, `day7-run-tracking`, `day7-completion-promise`, `day7-wait-for-completion` | 6/6 |
| Execution and observability | `day7-dag-parallel`, `day7-artifact-transfer`, `day7-environment-routing`, `day7-health-rollback`, `day7-observability-integration` | 5/5 |
| Failure recovery and resources | `day7-failure-recovery`, `day7-resource-hardening`, `workspace-lifecycle`, `workspace-execution`, `concurrency-final`, `concurrent-failure-robustness` | 6/6 |
| GitHub integration with local API mocks | `day7-github-full-integration`, `day7-github-end-to-end` | 2/2 |

Suite counts refer to processes/files, not individual assertions. Expected failure scenarios inside a passing suite do not mean the suite failed.

## Local demo evidence

The final successful demo run recorded run ID `d749371a-e5c0-4f85-9db5-3a3def3f2da6`. The script retained a summary, JSONL lifecycle log and release artifact in an ignored, unique `runtime/portfolio-demo-*` folder. The summary includes `parallelObserved: true`, all four jobs `SUCCESS`, one completed successful run, zero active runs, and mock commit statuses in the order `pending`, `success`. These are local observations, not GitHub-hosted run evidence.

The signing secret and fake authorization value are not written into the summary. Evidence directories are not committed; running the script generates fresh evidence with new IDs and ports.

Additional checks: all three Mermaid blocks parsed successfully with Mermaid;
39 relative documentation links/anchors resolved; a credential-pattern scan
of the changed docs passed. A temporary local smoke harness launched
`node dist/server.js` with a temporary `PORT`, confirmed root and live-workflow
metrics returned 200, confirmed a webhook without configured secret returned
503, then stopped the server. No visual rendering across every Markdown viewer
is claimed.

## Not verified in this update

| Step | Reason / how to verify |
| --- | --- |
| Real GitHub webhook delivery through a public tunnel | No live webhook/tunnel was configured in this workspace. Follow [DEMO.md](DEMO.md), start the verifier, then push the intended fresh main commit. |
| Real GitHub token permission and hosted commit status | The connected GitHub repository was read, but its connector credential is not supplied to the application. Mock API success does not verify a user's token or real GitHub delivery. |
| `day7-live-webhook.test.ts` | Requires server base URL, private token, main checkout, and a new real push. Not run. Exact command: `node --import tsx src/tests/day7-live-webhook.test.ts`. |
| `day7-full-release.test.ts` | Mixes local execution with live preconditions and a real push; the complete script was not run. Exact command: `node --import tsx src/tests/day7-full-release.test.ts`. Local release/failure behavior was checked with the separate suites above. |
| Every legacy test file, Linux/macOS, other Node versions | Outside this verification run. Do not extrapolate the 29-suite runner's result to the entire test directory or all platforms. |
| Real application build/deployment or production isolation/restart recovery | Not implemented by the sample capstone; it uses text artifacts and sample commands. Temporary directories are not containers, and in-memory tracking does not recover after restart. |
| Earlier chat's numbered exercises 7.4.5–7.4.8 | The retrieved chat contained reference markers and omitted screenshot contents. No reliable mapping from those exercise numbers to current test files was available. Concrete file/command results above are the evidence used here. |

See [README boundaries](../README.md#boundaries-and-next-steps) and [architecture semantics](ARCHITECTURE.md#state-failure-and-reporting-semantics) before making production-readiness claims.
