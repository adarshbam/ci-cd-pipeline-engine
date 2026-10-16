import { JobQueue } from "./job-queue.js";

export function enqueueReadyJobsOnce(
  queue: JobQueue,
  scheduled: Set<string>,
  readyJobIds: readonly string[],
): number {
  const previousQueueSize = queue.size;

  for (const readyJob of readyJobIds) {
    if (scheduled.has(readyJob)) continue;
    queue.enqueue(readyJob);
    scheduled.add(readyJob);
  }

  return queue.size - previousQueueSize;
}
