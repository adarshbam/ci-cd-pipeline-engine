# CI/CD dashboard

React/TypeScript and React Flow interface for inspecting the backend engine's workflows, runs, dependency graphs, logs, and artifacts.

[Engine overview](../README.md) · [Local setup](../docs/SETUP.md) · [Architecture](../docs/ARCHITECTURE.md)

## Run

From the repository root, with backend configuration prepared:

```sh
npm --prefix dashboard ci
npm run dashboard:dev
```

Start the API separately with `npm run dev`. Use the dashboard's API connection settings for the backend address; a rendered page without a working API is not evidence that jobs ran.

```sh
npm run dashboard:build
```

This builds the dashboard into `dashboard/dist`; the built backend can serve it. [package.json](package.json) lists dashboard-local scripts.

## Source map

- [Pages](src/pages/) compose workflow, run, artifact, and integration views.
- [Source](src/) contains API/state and graph rendering code.
- The backend [router](../src/routes/webhook.routes.ts) defines real data, permissions, and actions.

The dashboard is a client, not a second scheduler or security boundary. Treat displayed metrics as observations of available run history; a session's success rate or duration is not an engine benchmark.
