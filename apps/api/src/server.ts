import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { checkDatabaseConnection, disconnectDatabase, prisma } from "./database/prisma.js";
import { createApp } from "./app.js";
import { providerRegistry } from "./modules/ai-providers/index.js";
import { generationQueue, shouldRunWorker, startGenerationWorker, wireGenerationQueue } from "./modules/generations/index.js";
import { creditsService } from "./modules/credits/credits.service.js";

async function main(): Promise<void> {
  const dbUp = await checkDatabaseConnection();
  if (!dbUp) {
    logger.error({ url: env.DATABASE_URL.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@") }, "Cannot connect to PostgreSQL. Is it running? (npm run db:up)");
    process.exit(1);
  }

  // Jobs interrupted by a previous crash/restart are marked as failed so the UI never spins forever.
  const stale = await prisma.bannerGeneration.updateMany({
    where: { status: { in: ["pending", "running"] } },
    data: { status: "failed", errorMessage: "The server restarted while this generation was in progress. Please retry.", completedAt: new Date() },
  });
  if (stale.count > 0) {
    logger.warn({ count: stale.count }, "Marked interrupted generations as failed");
    await prisma.banner.updateMany({ where: { status: "generating" }, data: { status: "failed" } });
    // Banners that already have a version go back to "ready".
    await prisma.$executeRaw`UPDATE banners SET status = 'ready' WHERE status = 'failed' AND current_version_id IS NOT NULL`;
  }

  const returned = await creditsService.releaseOrphans();
  if (returned > 0) logger.warn({ returned }, "Returned credits held by interrupted generations");

  if (shouldRunWorker()) await startGenerationWorker();
  else wireGenerationQueue();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    const providers = providerRegistry.describe().providers.map((p) => `${p.id}${p.configured ? "" : " (not configured)"}`);
    logger.info({ port: env.PORT, frontend: env.FRONTEND_URL, providers, googleOAuth: env.googleOAuthConfigured, storage: env.storageRoot }, `API listening on ${env.apiPublicUrl}/api`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal, queue: generationQueue.size() }, "Shutting down");
    server.close(async () => {
      await generationQueue.stop();
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
