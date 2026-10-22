import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

import type { StepExecutionResult } from "../types/step-result.js";
import { validateTimeoutMs } from "./timeout-validator.js";

// Helper: resolve appropriate bash shell binary across Windows and POSIX
export function resolveBashCommand(): string {
  if (process.platform === "win32") {
    const gitBashCandidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    for (const cand of gitBashCandidates) {
      if (existsSync(cand)) {
        return cand;
      }
    }
  }
  return "bash";
}

// Terminate the spawned process and its children.
export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;

  // Never terminate an unknown PID or our own server.
  if (
    pid === undefined ||
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    pid === process.pid
  ) {
    return;
  }

  if (process.platform === "win32") {
    // Windows: terminate the process tree.
    await new Promise<void>((resolve) => {
      execFile(
        "taskkill",
        ["/PID", String(pid), "/T", "/F"],
        {
          windowsHide: true,
          timeout: 5000,
        },
        (error) => {
          if (error && child.exitCode === null && child.signalCode === null) {
            try {
              child.kill("SIGKILL");
            } catch {
              // Process may have already exited.
            }
          }

          // Prevent inherited pipe handles from keeping
          // the runner waiting indefinitely.
          child.stdout?.destroy();
          child.stderr?.destroy();
          child.stdin?.destroy();

          resolve();
        },
      );
    });

    return;
  }

  // Linux/macOS:
  // The child was spawned into its own process group.
  // A negative PID targets that group.
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Fallback: terminate the original process.
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // It may already have exited.
      }
    }
  }
}

export async function runProcess(
  args: string[],
  cwd?: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<StepExecutionResult> {
  // Node.js maximum normal timer delay.
  if (timeoutMs !== undefined && timeoutMs > 2_147_483_647) {
    throw new Error("Timeout exceeds maximum supported duration");
  }

  return new Promise<StepExecutionResult>((resolve, reject) => {
    const startedAt = new Date();

    if (signal?.aborted) {
      return resolve({
        exitCode: null,
        stdout: "",
        stderr: "Step cancelled before execution",
        startedAt,
        finishedAt: new Date(),
        status: "CANCELLED",
      });
    }

    validateTimeoutMs(timeoutMs);

    const bashCmd = resolveBashCommand();
    const scriptRun = spawn(bashCmd, args, {
      cwd,
      windowsHide: true,

      // POSIX only: create an isolated process group.
      // Never signal a negative PID without this.
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";

    let hasTimeout = false;
    let closed = false;

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        if (closed) return;

        hasTimeout = true;

        // Handle termination asynchronously without
        // creating an unhandled rejection.
        void terminateProcessTree(scriptRun).catch((error: unknown) => {
          stderr += "\nProcess termination error: " + String(error);
        });
      }, timeoutMs);
    }

    function cleanupTimer(): void {
      if (timeoutTimer !== undefined) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }
    }

    const abortHandler = () => {
      if (closed) return;
      stderr += "\nProcess cancelled by user";
      void terminateProcessTree(scriptRun).catch(() => {});
    };

    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    scriptRun.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    scriptRun.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    scriptRun.on("close", (code) => {
      closed = true;
      cleanupTimer();
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      if (hasTimeout) {
        stderr += `\nProcess timed out after ${timeoutMs}ms`;
      }

      const isCancelled = signal?.aborted === true;

      const result: StepExecutionResult = {
        exitCode: code,
        stdout,
        stderr,
        startedAt,
        finishedAt: new Date(),
        status: isCancelled
          ? "CANCELLED"
          : code === 0 && !hasTimeout
            ? "SUCCESS"
            : "FAILED",
      };

      resolve(result);
    });

    scriptRun.on("error", (error) => {
      closed = true;
      cleanupTimer();
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      if (signal?.aborted) {
        return resolve({
          exitCode: null,
          stdout,
          stderr: stderr + `\nProcess error after cancellation: ${error.message}`,
          startedAt,
          finishedAt: new Date(),
          status: "CANCELLED",
        });
      }

      reject(error);
    });
  });
}
