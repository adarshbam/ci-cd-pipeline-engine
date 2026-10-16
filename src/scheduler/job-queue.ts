export class JobQueue {
  private queuedJobs: string[] = [];

  enqueue(jobId: string): void {
    // Implement
    if (this.has(jobId)) return;
    this.queuedJobs.push(jobId);
  }

  dequeue(): string | undefined {
    // Implement
    return this.queuedJobs.shift();
  }

  has(jobId: string): boolean {
    // Implement
    return this.queuedJobs.includes(jobId);
  }

  get size(): number {
    // Implement
    return this.queuedJobs.length;
  }
}
