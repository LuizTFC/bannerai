import { afterAll, beforeEach } from "vitest";
import fs from "node:fs/promises";
import { disconnectDatabase, prisma } from "../database/prisma.js";
import { env } from "../config/env.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "session" RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await disconnectDatabase();
  await fs.rm(env.storageRoot, { recursive: true, force: true });
});
