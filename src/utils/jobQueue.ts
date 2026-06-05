/**
 * Minimal in-process background job queue.
 *
 * Audio slicing (cutting per-press clips out of the continuous room recording)
 * is heavy I/O + ffmpeg work that must NOT block the HTTP response that stops a
 * recording. This queue decouples that work: handlers enqueue a job and return
 * immediately, while a single background worker drains the queue sequentially.
 *
 * Sequential (concurrency 1) is intentional — ffmpeg is CPU-bound and the box
 * also runs the SFU/Egress, so we avoid spawning many ffmpeg processes at once.
 * Jobs are retried a few times with backoff; a permanently failing job is
 * logged and dropped so it can't wedge the queue.
 *
 * This is in-memory: a process restart loses queued jobs. That's acceptable
 * here (a dropped slice just means a missing clip, and orphan-cleanup still
 * stops the underlying Egress). Swap this for a persistent queue (e.g. a DB
 * table polled by the worker, or BullMQ if Redis is added) if clips must
 * survive restarts.
 */

interface Job {
    name: string;
    run: () => Promise<void>;
    attempts: number;
    maxAttempts: number;
}

const queue: Job[] = [];
let draining = false;

const RETRY_BASE_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const drain = async () => {
    if (draining) return;
    draining = true;
    try {
        while (queue.length > 0) {
            const job = queue.shift()!;
            job.attempts += 1;
            const startedAt = Date.now();
            try {
                await job.run();
                console.log(
                    `[jobQueue] "${job.name}" done in ${Date.now() - startedAt}ms (attempt ${job.attempts})`,
                );
            } catch (err) {
                if (job.attempts < job.maxAttempts) {
                    const backoff = RETRY_BASE_MS * job.attempts;
                    console.warn(
                        `[jobQueue] "${job.name}" failed (attempt ${job.attempts}/${job.maxAttempts}), retrying in ${backoff}ms:`,
                        err,
                    );
                    await sleep(backoff);
                    queue.push(job); // re-enqueue at the tail
                } else {
                    console.error(
                        `[jobQueue] "${job.name}" permanently failed after ${job.attempts} attempts:`,
                        err,
                    );
                }
            }
        }
    } finally {
        draining = false;
    }
};

/**
 * Enqueue a background job. Returns immediately; the job runs on the worker.
 */
export const enqueueJob = (
    name: string,
    run: () => Promise<void>,
    maxAttempts = 3,
): void => {
    queue.push({ name, run, attempts: 0, maxAttempts });
    console.log(`[jobQueue] enqueued "${name}" (queue depth ${queue.length})`);
    // Kick the worker (fire-and-forget; drain guards against re-entry).
    void drain();
};

/** Current number of pending jobs — exposed for health/diagnostics if needed. */
export const pendingJobCount = (): number => queue.length;
