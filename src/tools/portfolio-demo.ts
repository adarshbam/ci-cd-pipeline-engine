// Standalone local demonstration. No .env file or real GitHub requests are used.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Workflow } from "../workflow/workflow.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflow: Workflow = JSON.parse(
  await readFile(new URL("../../workflows/day7-live-github.json", import.meta.url), "utf8"),
);
const repository = workflow.trigger.allowedRepositories?.[0];
assert.ok(repository);
const sha = "a".repeat(40); // Synthetic commit, sent only to the local mock.
const deliveryId = randomUUID();
const secret = randomBytes(32).toString("hex");
const fakeToken = "portfolio-local-token";
const reports: { path: string; state: string; context: string }[] = [];

// Keep this run's evidence separate from existing runs and retained artifacts.
await mkdir(join(projectRoot, "runtime"), { recursive: true });
const evidenceRoot = await mkdtemp(join(projectRoot, "runtime", "portfolio-demo-"));
process.chdir(evidenceRoot);

// Override inherited credentials in this child process before creating the router.
process.env.GITHUB_WEBHOOK_SECRET = secret;
process.env.GITHUB_TOKEN = fakeToken;

const github = createServer(async (req, res) => {
  try {
    assert.equal(req.method, "POST");
    assert.equal(req.url, `/repos/${repository}/statuses/${sha}`);
    assert.equal(req.headers.authorization, `Bearer ${fakeToken}`);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert.equal(body.context, "custom-ci/pipeline");
    assert.ok(body.state === "pending" || body.state === "success");
    reports.push({ path: req.url!, state: body.state, context: body.context });
    console.log(`Mock GitHub commit status: ${body.state} (${body.context})`);
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: reports.length }));
  } catch (error) {
    console.error("Mock GitHub rejected an unexpected request:", error);
    res.writeHead(400);
    res.end();
  }
});

async function start(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

let appServer: Server | undefined;
try {
  process.env.GITHUB_API_BASE_URL = await start(github);
  const { createWebhookRouter } = await import("../routes/webhook.routes.js");
  const app = express();
  app.use(createWebhookRouter([workflow]));
  appServer = createServer(app);
  const base = await start(appServer);
  const endpoint = `${base}${workflow.webhook.url}`;
  console.log("LOCAL PORTFOLIO DEMO — real engine, synthetic push, mock GitHub API");
  console.log(`Workflow: ${workflow.name}; receiver: ${endpoint}`);

  async function getJSON(url: string): Promise<any> {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    return response.json();
  }

  async function send(branch = "main", invalidSignature = false): Promise<Response> {
    const body = JSON.stringify({
      ref: `refs/heads/${branch}`, after: sha, deleted: false,
      repository: { full_name: repository },
    });
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-GitHub-Event": "push",
        "X-GitHub-Delivery": deliveryId,
        "X-Hub-Signature-256": invalidSignature ? "sha256=" + "0".repeat(64) : signature,
      },
      body, signal: AbortSignal.timeout(5000),
    });
  }

  const before = await getJSON(`${endpoint}/metrics`);
  assert.equal(before.totalRuns, 0);
  assert.equal(before.activeRuns, 0);
  assert.equal((await send("main", true)).status, 401);
  assert.equal((await send("feature/demo")).status, 200);
  const ignored = await getJSON(`${endpoint}/metrics`);
  assert.equal(ignored.totalRuns, 0);
  assert.equal(ignored.activeRuns, 0);
  assert.deepEqual(reports.map((report) => report.state), []);
  console.log("Invalid signature rejected (401); unselected branch acknowledged without a run.");

  const response = await send();
  assert.equal(response.status, 200);
  const acknowledgement = await response.json();
  assert.equal(acknowledgement.deliveryId, deliveryId);
  assert.equal(acknowledgement.received, true);
  console.log("Signed main push accepted (200); acknowledgement does not mean completion.");

  // POST intentionally returns delivery metadata, not a run ID. This isolated
  // evidence directory contains only this demo's single newly created run log.
  const logFiles = (await readdir("runtime/logs")).filter((name) => name.endsWith(".jsonl"));
  assert.equal(logFiles.length, 1);
  const runId = logFiles[0]!.slice(0, -6);
  let parallelObserved = false;
  let completed: any;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const run = await getJSON(`${endpoint}/runs/${runId}`);
    const unit = run.jobs["unit-test"].status;
    const integration = run.jobs["integration-test"].status;
    if (unit === "RUNNING" || integration === "RUNNING") {
      assert.equal(run.jobs.build.status, "SUCCESS");
    }
    if (unit === "RUNNING" && integration === "RUNNING") {
      parallelObserved = true;
      assert.equal(run.jobs.deploy.status, "QUEUED");
    }
    if (run.status === "FAILED") throw new Error(`Demo pipeline failed: ${JSON.stringify(run)}`);
    const metrics = await getJSON(`${endpoint}/metrics`);
    if (run.status === "SUCCESS" && metrics.activeRuns === 0 && reports.length === 2) {
      completed = run;
      break;
    }
    await sleep(20);
  }
  assert.ok(completed, "Demo did not complete within 30 seconds");
  assert.ok(parallelObserved, "Parallel test jobs were not observed");
  for (const job of Object.values(completed.jobs) as { status: string }[]) {
    assert.equal(job.status, "SUCCESS");
  }
  assert.deepEqual(reports.map((report) => report.state), ["pending", "success"]);
  const artifact = join("runtime", "artifacts", runId, "build", "release-bundle");
  assert.equal((await readFile(artifact, "utf8")).trim(), "Release ready");
  const logs = await getJSON(`${endpoint}/runs/${runId}/logs?limit=100`);
  assert.ok(logs.logs.some((entry: { message: string }) => entry.message === "Pipeline completed successfully"));
  assert.equal((await send()).status, 200);
  await sleep(100);
  const metrics = await getJSON(`${endpoint}/metrics`);
  assert.equal(metrics.totalRuns, 1);
  assert.equal(metrics.successfulRuns, 1);
  assert.equal(metrics.failedRuns, 0);
  assert.equal(metrics.activeRuns, 0);
  assert.equal(reports.length, 2);

  await writeFile("summary.json", JSON.stringify({
    mode: "local-mock-github", runId, acknowledgement, parallelObserved,
    run: completed, metrics, commitStatuses: reports, artifact,
  }, null, 2) + "\n");
  console.log(`Run: ${runId} — SUCCESS; all four jobs succeeded; parallel jobs observed.`);
  console.log("Artifact stored and verified by deploy; duplicate delivery did not rerun.");
  console.log(`Evidence: ${evidenceRoot}`);
  console.log("PASS — webhook → signature → selection → DAG → artifact → pending/success");
} finally {
  if (appServer) await close(appServer);
  await close(github);
}
