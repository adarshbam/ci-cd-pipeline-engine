import { JobQueue } from "./job-queue.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";

export async function executeQueuedJobs<T>(
  queue: JobQueue,
  limiter: ConcurrencyLimiter,
  execute: (jobId: string) => Promise<T>,
): Promise<T[]> {
  let executeableJobs = [];
  while (queue.size > 0) {
    const jobId = queue.dequeue();

    if (jobId === undefined) break;

    executeableJobs.push(jobId);
  }

  const promises: Promise<T>[] = executeableJobs.map((jobId) => {
    return limiter.run(() => execute(jobId));
  });

  return await Promise.all(promises);
}
