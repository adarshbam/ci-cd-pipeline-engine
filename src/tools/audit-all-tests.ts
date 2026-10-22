import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

interface TestResult {
  file: string;
  status: "PASS" | "FAIL" | "TIMEOUT";
  durationMs: number;
  error?: string;
}

async function runSingleTest(file: string): Promise<TestResult> {
  const filePath = join("src/tests", file);
  const start = Date.now();

  return new Promise<TestResult>((resolve) => {
    let resolved = false;
    const proc = spawn("npx", ["tsx", "--test", filePath], {
      shell: true,
      windowsHide: true,
      env: { ...process.env, CI: "true" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          proc.kill("SIGKILL");
        } catch {}
        resolve({
          file,
          status: "TIMEOUT",
          durationMs: Date.now() - start,
          error: "Test exceeded 20s timeout limit",
        });
      }
    }, 20000);

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        const durationMs = Date.now() - start;
        if (code === 0) {
          resolve({ file, status: "PASS", durationMs });
        } else {
          resolve({
            file,
            status: "FAIL",
            durationMs,
            error: (stderr || stdout).slice(0, 400),
          });
        }
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          file,
          status: "FAIL",
          durationMs: Date.now() - start,
          error: err.message,
        });
      }
    });
  });
}

async function main() {
  const testFiles = readdirSync("src/tests")
    .filter((f) => f.endsWith(".test.ts"))
    .sort();

  console.log(`Starting execution of ${testFiles.length} test files...`);

  const results: TestResult[] = [];
  const passed: string[] = [];
  const failed: TestResult[] = [];

  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];
    if (!file) continue;
    process.stdout.write(`[${i + 1}/${testFiles.length}] Testing ${file}... `);
    const res = await runSingleTest(file);
    results.push(res);
    if (res.status === "PASS") {
      passed.push(file);
      console.log(`PASS (${res.durationMs}ms)`);
    } else {
      failed.push(res);
      console.log(`${res.status} (${res.durationMs}ms)`);
    }
  }

  console.log("\n=================================");
  console.log(`TOTAL: ${results.length}`);
  console.log(`PASSED: ${passed.length}`);
  console.log(`FAILED / TIMED OUT: ${failed.length}`);
  console.log("=================================\n");

  if (failed.length > 0) {
    console.log("Failed Suites:");
    for (const f of failed) {
      console.log(`- ${f.file} (${f.status})`);
      if (f.error) {
        console.log(`  Reason: ${f.error.replace(/\n/g, " ").slice(0, 150)}`);
      }
    }
  }
}

main().catch(console.error);
