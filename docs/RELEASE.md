# Release and operating checks

[Setup](SETUP.md) · [Architecture](ARCHITECTURE.md) · [Demo](DEMO.md) · [Verification history](VERIFICATION.md)

This is a checklist for reviewing a candidate. It does not declare a production-ready release or deploy external infrastructure.

## Build and regression scope

```sh
npm ci
npm --prefix dashboard ci
npm test
npm run test:regression
npm run build
npm run dashboard:build
```

Record the commit, platform, Node version, exact command, and observed result. The package default suite is not every historical test file. Review the scope of `test:all` and live tests separately; preserve failures rather than reporting a generic green badge.

## Behavior to verify

- Signed push acceptance and rejection, repository/branch filters, duplicate deliveries.
- Two-slot concurrency **per run**, ready-wave behavior, failure/skip propagation, and unresolvable graphs.
- Step retry bounds, timeouts, cancellation, process cleanup, and artifact restoration failures.
- Stored run history after restart; interrupted runs become failed rather than resuming work.
- Management credentials/local access and every route actually exposed by the chosen ingress.
- Dashboard/server agreement on run state and the exact commit receiving GitHub status reports.

Use a controlled [live demonstration](DEMO.md#live-github-push) only after local checks. Preserve the distinction between synthetic status mocks, real GitHub delivery, and actual application deployment.

## Operating boundary

Workflows run trusted Bash commands as the server user. They need explicit checkout/build/deployment steps if a real project is to be deployed. Sample `echo`/artifact jobs are not deployment evidence.

Before using an external target, review privileges, provider credentials, endpoint exposure, backups/retention, and rollback commands for that environment. The built server has disk-backed history, but no distributed durable queue or automatic resume of interrupted jobs. Delivery IDs remain in memory. `MANAGEMENT_SECRET` does not guard all legacy workflow routes.

A dependency/schema file, successful build, or historical passing suite does not establish current availability, isolation, secret safety, or infrastructure recovery. Record only results actually observed for the candidate.
