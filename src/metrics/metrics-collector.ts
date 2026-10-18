export type CompletedRunStatus = "SUCCESS" | "FAILED";

export interface MetricsSnapshot {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number;
}

export class MetricsCollector {
  private recordedRuns = new Set<string>();
  private activeRuns = new Map<string, number>();

  private successfulRuns = 0;
  private failedRuns = 0;
  private runsTotalDuration = 0;

  recordCompletedRun(
    runId: string,
    status: CompletedRunStatus,
    runDuration: number,
  ): void {
    // Prevent duplicate recordings
    if (this.recordedRuns.has(runId)) return;

    // Remember this run
    this.recordedRuns.add(runId);

    if (status === "SUCCESS") {
      this.successfulRuns++;
    } else {
      this.failedRuns++;
    }

    this.runsTotalDuration += runDuration;
  }

  getSnapshot(): MetricsSnapshot {
    const totalRuns = this.successfulRuns + this.failedRuns;

    return {
      totalRuns,
      successfulRuns: this.successfulRuns,
      failedRuns: this.failedRuns,
      averageDurationMs:
        totalRuns === 0 ? 0 : this.runsTotalDuration / totalRuns,
    };
  }

  startRun(runId: string, startedAtMs: number = Date.now()): void {
    if (this.activeRuns.has(runId) || this.recordedRuns.has(runId)) {
      return;
    }

    this.activeRuns.set(runId, startedAtMs);
  }

  finishRun(
    runId: string,
    status: CompletedRunStatus,
    finishedAtMs: number = Date.now(),
  ): void {
    const startedAtMs = this.activeRuns.get(runId);

    if (startedAtMs === undefined) return;

    const duration = finishedAtMs - startedAtMs;

    this.recordCompletedRun(runId, status, duration);
    this.activeRuns.delete(runId);
  }
  getActiveRunCount(): number {
    return this.activeRuns.size;
  }
}
