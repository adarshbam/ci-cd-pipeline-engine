
export interface StepExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: Date;
  finishedAt: Date;
  status: "SUCCESS" | "FAILED" | "CANCELLED";
}
