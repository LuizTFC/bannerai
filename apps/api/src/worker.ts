/**
 * Dedicated generation worker. Run as many instances as you need (`npm run start:worker`);
 * each one consumes jobs from the PostgreSQL-backed queue with WORKER_CONCURRENCY parallel jobs.
 * The API process only enqueues when RUN_WORKER=false.
 */
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { checkDatabaseConnection, disconnectDatabase } from "./database/prisma.js";
import { generationQueue, startGenerationWorker } from "./modules/generations/index.js";

async function main(): Promise<void> {
  if (!(await checkDatabaseConnection())) {
    logger.error("Cannot connect to PostgreSQL");
    process.exit(1);
  }
  await startGenerationWorker();
  logger.info({ concurrency: env.WORKER_CONCURRENCY, driver: env.QUEUE_DRIVER }, "Worker ready");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Worker shutting down");
    await generationQueue.stop();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal worker error");
  process.exit(1);
});
