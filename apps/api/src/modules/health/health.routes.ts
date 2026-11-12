import { Router } from "express";
import type { HealthResponse } from "@bannerai/shared";
import { env } from "../../config/env.js";
import { checkDatabaseConnection } from "../../database/prisma.js";

export const healthRouter = Router();
const startedAt = Date.now();

healthRouter.get("/", async (_req, res) => {
  const dbUp = await checkDatabaseConnection();
  const body: HealthResponse = {
    status: dbUp ? "ok" : "degraded",
    database: dbUp ? "up" : "down",
    version: env.APP_VERSION ?? process.env.npm_package_version ?? null,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };
  res.status(dbUp ? 200 : 503).json(body);
});
