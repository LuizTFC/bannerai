import { PgBoss } from "pg-boss";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export type Runner = (generationId: string, attempt: number) => Promise<void>;

export interface GenerationQueue {
  enqueue(generationId: string): Promise<void>;
  setRunner(runner: Runner): void;
  /** Starts consuming jobs (API in dev, or a dedicated worker process in production). */
  startWorker(): Promise<void>;
  stop(): Promise<void>;
  size(): { pending: number; active: number };
}

/**
 * In-process queue: used by the test suite and as a fallback when QUEUE_DRIVER=memory.
 * Generation requests return immediately (HTTP 202) and the frontend polls the status.
 */
export class MemoryQueue implements GenerationQueue {
  private readonly pending: string[] = [];
  private readonly active = new Set<string>();
  private runner: Runner | null = null;

  constructor(private readonly concurrency = 2) {}

  setRunner(runner: Runner): void {
    this.runner = runner;
  }

  async enqueue(generationId: string): Promise<void> {
    if (this.pending.includes(generationId) || this.active.has(generationId)) return;
    this.pending.push(generationId);
    queueMicrotask(() => this.drain());
  }

  async startWorker(): Promise<void> {
    this.drain();
  }

  async stop(): Promise<void> {}

  size(): { pending: number; active: number } {
    return { pending: this.pending.length, active: this.active.size };
  }

  private drain(): void {
    if (!this.runner) return;
    while (this.active.size < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      this.active.add(id);
      this.runner(id, 0)
        .catch((err) => logger.error({ err, generationId: id }, "Generation job crashed"))
        .finally(() => {
          this.active.delete(id);
          this.drain();
        });
    }
  }
}

const QUEUE_NAME = "generate-banner";

/**
 * Durable queue backed by PostgreSQL (pg-boss). Any number of API instances can enqueue and any
 * number of worker processes can consume, so generation capacity scales horizontally without
 * extra infrastructure. Jobs survive restarts and are retried once if a worker dies mid-job.
 */
export class PgBossQueue implements GenerationQueue {
  private boss: PgBoss | null = null;
  private runner: Runner | null = null;
  private active = 0;
  private started: Promise<PgBoss> | null = null;

  constructor(private readonly concurrency = env.WORKER_CONCURRENCY) {}

  setRunner(runner: Runner): void {
    this.runner = runner;
  }

  private async client(): Promise<PgBoss> {
    if (!this.started) {
      this.started = (async () => {
        const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss", max: 4 });
        boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
        await boss.start();
        await boss.createQueue(QUEUE_NAME);
        this.boss = boss;
        return boss;
      })();
    }
    return this.started;
  }

  async enqueue(generationId: string): Promise<void> {
    const boss = await this.client();
    await boss.send(QUEUE_NAME, { generationId }, { singletonKey: generationId, retryLimit: 1, retryDelay: 5, expireInSeconds: env.GENERATION_TIMEOUT_SECONDS });
  }

  async startWorker(): Promise<void> {
    const boss = await this.client();
    if (!this.runner) throw new Error("Queue runner not set");
    const runner = this.runner;
    await boss.work<{ generationId: string }>(QUEUE_NAME, { batchSize: 1, localConcurrency: this.concurrency, pollingIntervalSeconds: 1 }, async (jobs) => {
      for (const job of jobs) {
        this.active += 1;
        try {
          await runner(job.data.generationId, job.retryCount);
        } finally {
          this.active -= 1;
        }
      }
    });
    logger.info({ concurrency: this.concurrency, queue: QUEUE_NAME }, "Generation worker started");
  }

  async stop(): Promise<void> {
    if (this.boss) await this.boss.stop({ graceful: true, timeout: 30_000 });
  }

  size(): { pending: number; active: number } {
    return { pending: -1, active: this.active };
  }
}

export function createGenerationQueue(): GenerationQueue {
  if (env.QUEUE_DRIVER === "memory" || env.isTest) return new MemoryQueue(env.WORKER_CONCURRENCY);
  return new PgBossQueue(env.WORKER_CONCURRENCY);
}

export const generationQueue: GenerationQueue = createGenerationQueue();
