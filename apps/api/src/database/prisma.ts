import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

export const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

const adapter = new PrismaPg(pgPool);

export const prisma = new PrismaClient({
  adapter,
  log: env.isProduction ? ["error"] : ["warn", "error"],
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pgPool.end();
}
