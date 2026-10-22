# GitHub CI/CD Engine

A lightweight, dependency-aware, self-hosted CI/CD engine built with Node.js, Express, TypeScript, and a React + React Flow management dashboard.

The engine transforms signed GitHub push webhooks into dependency-resolved parallel pipeline jobs, executes sequential Bash steps in isolated workspaces, captures live execution logs, and reports real-time commit statuses back to GitHub.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Ingestion [GitHub Ingestion]
        GH[GitHub Push Event] -->|HMAC-SHA256 Signature| Webhook[POST /webhooks/:workflow]
        Webhook -->|Verify Signature & Deduplicate| AuthGate{Signature Valid?}
        AuthGate -->|No| Reject[401 Unauthorized]
        AuthGate -->|Yes| FilterGate{Branch & Repo Allowed?}
    end

    subgraph Core [Engine Core]
        FilterGate -->|Yes| Engine[PipelineEngine]
        Engine -->|Initial Pending Status| GHStatus[GitHub Commit Status API]
        Engine -->|Topological Sort & Dependencies| Scheduler[PipelineScheduler]
        Scheduler -->|Spawn Processes| Runner[ProcessRunner: Bash Step Execution]
        Runner -->|Stream Output| Logs[Execution Logs: JSONL]
        Runner -->|Workspace Scoped| Artifacts[ArtifactManager]
    end

    subgraph Management [Dashboard UI & API]
        UI[React Flow Dashboard UI] <-->|CORS / Loopback Guard| ManagementAPI[/api/* Management Endpoints]
        ManagementAPI --> Engine
        ManagementAPI --> Logs
        UI --> DAG[Interactive React Flow DAG]
        UI --> Inspector[Job Log Drawer & Step Output]
        UI --> Controls[Manual Trigger & Process Cancellation]
    end
```

---

## Features That Genuinely Work

- **Cryptographic Webhook Authentication**: Verifies `X-Hub-Signature-256` HMAC-SHA256 signatures over raw request byte buffers using `crypto.timingSafeEqual`.
- **Dependency-Aware DAG Scheduling**: Evaluates job `needs` graphs, executes independent jobs concurrently (up to 2 parallel jobs per pipeline), and cascades `SKIPPED` / `CANCELLED` states upon failure.
- **Interactive React Flow DAG**: Renders real workflow topology and live pipeline execution with dynamic column depth calculation, animated running edges, and color-coded state transitions.
- **Process Isolation & Tree Termination**: Runs shell commands in dedicated child processes; cleanly terminates entire process trees upon cancellation or timeout using `taskkill /T /F` on Windows and `SIGKILL` on POSIX.
- **Workspace Scoped Artifact Transfer**: Automatically shares declared files and directories between dependent jobs via isolated local workspaces.
- **Workflow Discovery (`/workflows`)**: Auto-discovers and validates all 14 declarative workflows in `workflows/*.json`, with configuration previews, masked secrets, and manual triggers.
- **Operational Run History (`/runs`)**: Filterable, searchable execution history showing real duration, git commit context, job progress, and deep links to failed logs.
- **Live Execution Inspector**: Slide-over drawer with real-time stdout/stderr log streams, severity filtering (`INFO`, `WARN`, `ERROR`), and step exit codes.
- **Hardened Management Security**: Blocks reverse proxy / tunnel access by default, validates origins against CSRF, and never exposes tokens or secrets over the wire.
- **GitHub Integration Onboarding (`/integrations`)**: Complete 10-step webhook setup guide, dynamic payload URL generator, commit status guide, and live API connectivity probe.

---

## Prerequisites

- **Node.js**: Version 20+ (tested on Node.js 24.11.1).
- **npm**: Version 10+ (tested on npm 11.15.0).
- **Git** & **Bash**: Available on system `PATH` (on Windows, Git Bash at `C:\Program Files\Git\usr\bin\bash.exe`).

---

## Quick Start (Fresh Clone)

### 1. Install Dependencies
```bash
npm install
npm --prefix dashboard install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` to configure:
- `PORT=3000` (default Express listener port)
- `GITHUB_WEBHOOK_SECRET=your_secret_here` (matching GitHub Webhook settings)
- `GITHUB_TOKEN=ghp_your_token_here` (fine-grained PAT with *Commit statuses: Read & Write*)
- `MANAGEMENT_SECRET` (optional: leave unset for local-only loopback access)

### 3. Start the Backend Server
```bash
npm run dev
```
The engine starts on port `3000` and automatically loads all workflows from `workflows/*.json`.

### 4. Start the Dashboard UI
In a separate terminal:
```bash
npm run dashboard:dev
```
Open `http://localhost:5173` in your browser. The dashboard connects to `http://localhost:3000` in **REAL MODE**.

---

## Running Pipelines

### Manual Trigger via Dashboard
1. Open **Workflows** in the sidebar.
2. Select any valid workflow (e.g., `day7-release-smoke` or `day7-capstone`).
3. Click **Run**, choose target branch (`main`), and confirm.
4. Watch the pipeline progress live through the interactive React Flow DAG!

### Live GitHub Webhooks
To receive webhooks from GitHub.com on your local machine:
1. Start an ngrok tunnel:
   ```bash
   npm run tunnel
   ```
2. Copy the public URL into your `.env`:
   ```env
   PUBLIC_WEBHOOK_BASE_URL=https://<your-id>.ngrok-free.app
   ```
3. In your GitHub repository:
   - Navigate to **Settings** → **Webhooks** → **Add webhook**.
   - Payload URL: `https://<your-id>.ngrok-free.app/webhooks/<workflow-name>`
   - Content type: `application/json`
   - Secret: Matches your `GITHUB_WEBHOOK_SECRET`
   - SSL verification: Enabled
   - Events: `push`
4. Push a commit to your repository to trigger execution.

---

## Pipeline Cancellation

The engine supports safe, asynchronous cancellation of active pipelines:
- Click **Cancel Run** on the run details page or in the Runs list.
- Running child processes are immediately terminated using native process tree killing (`taskkill` on Windows, process group `SIGKILL` on POSIX).
- Waiting dependent jobs are marked `CANCELLED` and never execute.
- Active run counts decrement and workspaces are preserved for post-mortem debugging.

---

## Running Automated Tests

Run the full automated test suite (all 8 test suites):
```bash
npm test
```

Build production artifacts:
```bash
# Build backend
npm run build

# Build frontend dashboard
npm run dashboard:build
```

---

## Security Model & Boundaries

1. **Zero Credential Exposure**: `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, and `MANAGEMENT_SECRET` are never sent over the wire or stored in browser state.
2. **Reverse Proxy / Tunnel Protection**: Management endpoints (`/api/*`) strictly reject requests arriving through public tunnels (`X-Forwarded-For`, `ngrok-free.dev`) unless `MANAGEMENT_SECRET` is configured and supplied via `x-management-token`.
3. **CORS & CSRF Protection**: CORS headers are restricted to trusted local development origins (`localhost` / `127.0.0.1`). State-changing POST requests reject unauthorized cross-origin requests.
4. **Input Sanitization**: Workflow names, run IDs, and job IDs are validated against strict regex (`^[a-zA-Z0-9_-]+$`) to prevent path traversal attacks against filesystem logs.
5. **Masked Configurations**: Workflow inspection endpoints automatically mask all sensitive environment keys with `********`.

---

## Current Architecture Scope

- **Persistent Local Run History**: Execution runs and logs are saved to atomic local disk storage in `runtime/history/runs/` and `runtime/logs/`. History survives restarts without external cloud or database dependencies.
- **Local Secret Model**: Secrets are configured on the host server via `.env`. In-browser runtime secret editing is disabled for security.
- **Declarative Workflows**: Workflows are loaded at startup from `workflows/*.json` with schema validation.

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).

Copyright &copy; 2026 Adarsh Singh. All rights reserved.

---

## Troubleshooting

- **Port in use (EADDRINUSE: 3000)**: Kill the previous process or specify a custom port in `.env` (`PORT=4000`).
- **Signature verification failure (401)**: Verify that `GITHUB_WEBHOOK_SECRET` in `.env` matches the secret configured in GitHub Webhook settings character-for-character.
- **Management API 403 Forbidden**: Ensure you are accessing the dashboard from `localhost` / `127.0.0.1`. If tunneling through ngrok, configure `MANAGEMENT_SECRET` in `.env`.
- **Bash command not found on Windows**: Ensure Git Bash is installed and added to `PATH` (`C:\Program Files\Git\usr\bin\bash.exe`).
