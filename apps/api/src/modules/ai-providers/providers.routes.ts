import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { providerRegistry } from "./registry.js";

export const providersRouter = Router();

providersRouter.get("/", requireAuth, (_req, res) => {
  res.json(providerRegistry.describe());
});
