# CI/CD Pipeline Engine

A lightweight, declarative CI/CD runner and execution engine built from scratch in TypeScript and Node.js.

---

## 1. The Problem and Intended Users

### The Problem
Modern CI/CD platforms (like GitHub Actions runners or GitLab runners) are complex, heavy systems often treated as opaque black boxes. When building internal developer platforms, edge automation runners, or lightweight local build workers, developers often need:
- A transparent, minimal runner that parses structured workflow definitions.
- Deterministic process and script execution in isolated workspaces.
- Fast webhook-driven execution without the overhead of container orchestration for every lightweight task.

### Intended Users
- **Backend and Platform Engineers** exploring the internal mechanics of CI/CD engines, job runners, and execution lifecycles.
- **Developers** seeking a self-hosted, lightweight TypeScript runner for local or edge webhook automation.

---

## 2. What Works Today

- **Declarative Workflow Loading**: Parses and loads workflow configuration files (`workflows/*.json`) with structured JSON schema definitions (`workflow.schema.json`).
- **Webhook Ingestion**: Express 5 server exposes endpoints (`/github/ci-cd`) that listen for GitHub push webhook events and match branch triggers (`develop`, `main`).
- **Pipeline Run Lifecycle**: State machine (`RunPipeline`) tracking runs through `QUEUED`, `RUNNING`, `SUCCESS`, and `FAILED` states with precise ISO timestamps (`startedAt`, `finishedAt`).
- **Sequential Step Execution**: Step runner (`runSteps`) executes sequential tasks, capturing stdout, stderr, and exit codes.
- **Fail-Fast Step Execution**: If any step in a job fails (exit code !== 0), subsequent steps in that job are halted immediately.
- **Command & Script Execution**: Dedicated runners for inline shell commands (`CommandRunner`) and external script files (`ScriptRunner`) utilizing Node.js `child_process.spawn`.
- **Sandboxed Workspace Allocation**: `withWorkspace` provisions isolated temporary directories (`os.tmpdir()`) for step execution to prevent pollution of the host working directory.

---

## 3. My Specific Contribution and Project Origin

### Origin
This project was initiated by **Adarsh Singh** as a hands-on systems-level study into how modern automation runners parse, sandbox, and execute CI/CD workflows from first principles.

### Specific Contributions
- **Runner Architecture Design**: Structured the codebase into decoupled layers: schema/workflow loading (`src/workflow/`), pipeline scheduling (`src/pipeline/`), workspace management (`src/runner/`), and process execution (`src/steps/`).
- **Process Abstraction Layer**: Built `ProcessRunner` on top of `node:child_process` with proper stream handling, error propagation, and cross-platform command execution.
- **Step Execution Engine**: Built the sequential runner (`steps-runner.ts`) and workspace sandboxing wrapper (`workspace.ts`).
- **Test Suite**: Wrote unit and integration test suites validating command outputs, exit code propagation, sequential step aborts, and pipeline status transitions.

---

## 4. Architecture and Important Decisions Supported by Code

```
┌────────────────────────────────────────────────────────┐
│                   GitHub Push Webhook                  │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP POST
                            ▼
┌────────────────────────────────────────────────────────┐
│             Express 5 Webhook Router                   │
│         (src/routes/webhook.routes.ts)                 │
└───────────────────────────┬────────────────────────────┘
                            │ Trigger Event
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Pipeline Engine                       │
│           (src/pipeline/pipeline-engine.ts)            │
│         - Creates RunPipeline instance                 │
│         - Tracks state: QUEUED -> RUNNING              │
└───────────────────────────┬────────────────────────────┘
                            │ Dispatches Jobs
                            ▼
┌────────────────────────────────────────────────────────┐
│                     Job Runner                         │
│             (src/runner/job-runner.ts)                 │
│         - Allocates temp workspace (workspace.ts)      │
│         - Sequences steps (steps-runner.ts)            │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌───────────────────────────┐┌───────────────────────────┐
│       CommandRunner       ││       ScriptRunner        │
│  (src/steps/command-      ││   (src/steps/script-      │
│        runner.ts)         ││        runner.ts)         │
│  - Executes inline `run`  ││  - Executes file `script` │
│  - Captures stdout/stderr ││  - Validates exit code    │
└───────────────────────────┘└───────────────────────────┘
```

### Key Engineering Decisions:
1. **Decoupled Process Runners**: Rather than executing raw shell strings arbitrarily, `ProcessRunner` explicitly separates shell command strings (`run`) from discrete script files (`script`).
2. **Fail-Fast Loop**: In `src/steps/steps-runner.ts`, step execution iterates sequentially. When `result.status !== "SUCCESS"`, the loop immediately breaks, preventing unintended side effects from running after an earlier failure.
3. **Workspace Isolation (`withWorkspace`)**: Generates an ephemeral folder via `fs.mkdtemp` inside the system temporary directory (`os.tmpdir()`), runs the job steps within that working directory, and attempts cleanup in a `finally` block.

---

## 5. Setup Instructions and Required Configuration

### Prerequisites
- **Node.js**: v20.x, v22.x, or v24.x
- **npm**: v10.x+

### Installation
```bash
# Clone the repository
git clone https://github.com/adarshbam/ci-cd-pipeline-engine.git
cd ci-cd-pipeline-engine

# Install dependencies
npm install
```

### Environment Variables
The application uses the following optional configuration variables (via `.env` or system environment):
| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP server port for webhook listener | `3000` |

### Running the Server
```bash
# Run development server with live reload
npm run dev

# (Optional) Launch development server and local ngrok tunnel concurrently
npm run dev:all
```

---

## 6. Reproducible Example

### Workflow Definition (`workflows/project-1.json`)
```json
{
  "name": "sample-pipeline",
  "trigger": {
    "events": ["push"],
    "branches": {
      "main": "prod"
    }
  },
  "jobs": {
    "test": {
      "steps": [
        {
          "name": "Verify Node version",
          "run": "node --version"
        },
        {
          "name": "Echo build start",
          "run": "echo \"Build in progress...\""
        }
      ]
    }
  }
}
```

### Programmatic Invocation
```typescript
import { WorkflowLoader } from "./src/workflow/workflow-loader.js";
import PipelineEngine from "./src/pipeline/pipeline-engine.js";

// 1. Load workflows
const workflows = await WorkflowLoader.loadWorkflows("./workflows");

// 2. Initialize engine and trigger run
const engine = new PipelineEngine(workflows[0]);
const run = await engine.run();

console.log(`Pipeline started with ID: ${run.id}, Status: ${run.status}`);
```

---

## 7. Tests Actually Run and What They Establish

All tests can be executed individually using `tsx`:

| Test Suite | File | What It Establishes | Verified Result |
| :--- | :--- | :--- | :--- |
| **Command Runner** | `src/tests/command-runner.test.ts` | Confirms shell commands execute cleanly, capturing output and returning exit code `0`. | **PASS** |
| **Steps Runner** | `src/tests/steps-runner.test.ts` | Confirms sequential step execution and verifies that a failed step halts subsequent steps. | **PASS** |
| **Pipeline Lifecycle** | `src/tests/pipeline-run.test.ts` | Confirms valid state transitions (`QUEUED` -> `RUNNING` -> `SUCCESS`/`FAILED`) and illegal transition guards. | **PASS** |
| **Pipeline Engine** | `src/tests/pipeline-engine.test.ts` | Confirms workflow registration, execution initiation, and in-memory run tracking. | **PASS** |
| **Workspace Creation** | `src/tests/workspace.test.ts` | Confirms temporary directory provisioning inside `os.tmpdir()`. | **PASS** |
| **Workspace Execution** | `src/tests/workspace-execution.test.ts` | Confirms child processes execute within the assigned temporary directory path. | **PASS** *(Note: On Windows, delayed handle release can trigger `EBUSY` during teardown `rmdir`)* |

To execute tests:
```bash
npx tsx src/tests/command-runner.test.ts
npx tsx src/tests/steps-runner.test.ts
npx tsx src/tests/pipeline-engine.test.ts
```

---

## 8. Known Limitations and Roadmap

### Known Limitations
- **Job Dependency Graph (DAG)**: The workflow schema supports `needs: ["test", "lint"]`, but topological sorting and parallel dependency resolution across jobs are currently unimplemented. Jobs currently run independently.
- **Concurrency & In-Progress Cancellation**: The schema specifies `concurrency.cancelInProgress`, but active job process cancellation across multiple webhook triggers is not yet wired to a queue.
- **Artifact Passing**: Schema declarations for `artifacts.upload` and `artifacts.download` are parsed, but cross-job filesystem/S3 artifact passing is not yet implemented.
- **Windows Handle Contention (`EBUSY`)**: On Windows systems, immediate workspace folder cleanup right after process exit can encounter `EBUSY` while child process file handles are releasing.

### Roadmap
- [ ] **Topological DAG Scheduler**: Implement Kahn's algorithm or DFS cycle detection to resolve `needs` dependency graphs for parallel job execution.
- [ ] **Job Queue & Concurrency Controller**: Implement an in-memory or Redis-backed queue to manage concurrency limits and cancel superseded pipeline runs.
- [ ] **Artifact Storage**: Implement an S3/local-disk artifact store to persist and transfer build outputs between jobs.
- [ ] **Containerized Worker Mode**: Introduce Docker/Podman container execution to isolate runner tasks in clean container environments rather than host-level processes.
- [ ] **Windows Teardown Resilience**: Implement exponential backoff retry for directory removal during workspace cleanup on Windows.
