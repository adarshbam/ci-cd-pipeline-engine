# Local setup

[Overview](../README.md) · [Architecture](ARCHITECTURE.md) · [Demo](DEMO.md)

Use Node.js 24, npm, Git, and Bash on PATH. On Windows, Git Bash is the expected shell dependency for job commands. Workflows execute on your host; inspect their scripts before running them.

## Install and configure

From the repository root:

```sh
npm ci
npm --prefix dashboard ci
```

Copy [.env.example](../.env.example) to a private `.env` for `npm run dev`, which explicitly loads that file. Configure only the integrations you will use:

| Variable | Purpose |
| --- | --- |
| `PORT` | API port, default 3000 |
| `GITHUB_WEBHOOK_SECRET` | Signature verification for GitHub POST deliveries |
| `GITHUB_TOKEN` | GitHub commit-status reporting; scope it to the required repository/permissions |
| `MANAGEMENT_SECRET` | Explicit management credential when configured |
| `PUBLIC_WEBHOOK_BASE_URL` | Public tunnel base used to compose workflow-specific URLs |

For `npm start`, provide variables through the launching environment or an explicit Node environment-file invocation; do not assume that script loads `.env`. Keep real tokens outside docs, recordings, and Git.

## Start separately

Terminal 1:

```sh
npm run dev
```

Terminal 2:

```sh
npm run dashboard:dev
```

Read the actual startup ports. The dashboard development server normally uses 5173; the engine defaults to3000. Use the dashboard's backend connection settings for a non-default API address.

For a local built preview:

```sh
npm run build
npm run dashboard:build
npm start
```

The backend serves the built dashboard when `dashboard/dist` exists, with SPA routes handled by `server.ts`. This is not a production deployment procedure.

## Checks and troubleshooting

- `npm test`: explicit package-listed backend suites.
- `npm run test:regression`: historical regression entry point.
- `npm run test:all`: audit runner with its own scope; inspect before assuming every file is safe/offline.
- `npm run test:live`: real GitHub integration, requiring the setup in [Demo](DEMO.md).

If Bash is missing, add your installed Git Bash location to the process PATH. If a port is occupied, identify the existing process rather than stopping unrelated work. If a workflow is absent or edited, restart the backend: definitions are loaded at startup.

For ngrok, start and stop the tunnel independently. `npm run dev:all` exists, but duplicate tunnel/watch lifecycles can conflict; it is not the recommended troubleshooting path. [Exposure boundaries](ARCHITECTURE.md#access-and-exposure) apply before forwarding any port.
