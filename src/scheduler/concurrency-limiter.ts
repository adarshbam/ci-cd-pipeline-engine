export class ConcurrencyLimiter {
  private maxConcurrent: number;
  private concurrentRunningOperations: number;
  private pendingOperations: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    // Your implementation

    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent <= 0)
      throw new Error("Invalid maxconcurrent input!");
    this.maxConcurrent = maxConcurrent;
    this.concurrentRunningOperations = 0;
    this.pendingOperations = [];
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    // Your implementation
    if (this.concurrentRunningOperations >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.pendingOperations.push(resolve);
      });
    } else {
      this.concurrentRunningOperations++;
    }

    try {
      return await operation();
    } finally {
      const next = this.pendingOperations.shift();

      if (next) {
        next();
      } else {
        this.concurrentRunningOperations--;
      }
    }
  }

  get activeCount(): number {
    // Number currently executing
    return this.concurrentRunningOperations;
  }

  get pendingCount(): number {
    // Number waiting for a slot
    return this.pendingOperations.length;
  }
}
