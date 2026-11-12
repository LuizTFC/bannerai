import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { providersRouter } from "./modules/ai-providers/providers.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { billingRouter, stripeWebhookHandlers } from "./modules/billing/billing.routes.js";
import { configurePassport } from "./modules/auth/passport.js";
import { createSessionMiddleware } from "./modules/auth/session.js";
import { bannersRouter } from "./modules/banners/banners.routes.js";
import { brandKitsRouter } from "./modules/brand-kit/brand-kit.routes.js";
import { filesRouter } from "./modules/files/files.routes.js";
import { generationsRouter } from "./modules/generations/generations.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { uploadsRouter } from "./modules/uploads/uploads.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.isProduction ? 1 : false);

  app.use(
    helmet({
      // Images are streamed to a different origin (the Next.js app); keep resource policy permissive for same-site.
      crossOriginResourcePolicy: { policy: "same-site" },
      contentSecurityPolicy: env.isProduction ? undefined : false,
    }),
  );
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Requested-With"],
      maxAge: 600,
    }),
  );
  if (!env.isTest) {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith("/api/health") ?? false }, customLogLevel: (_req, res) => (res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info") }));
  }
  // Stripe webhook needs the raw body for signature verification and lives outside the session/CSRF chain.
  app.post("/api/billing/webhook", ...stripeWebhookHandlers);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  const passport = configurePassport();
  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  const api = express.Router();
  api.use(apiRateLimiter);
  api.use(csrfProtection({ exemptPaths: [/^\/auth\/google(\/callback)?$/] }));

  api.use("/health", healthRouter);
  api.use("/auth", authRouter);
  api.use("/billing", billingRouter);
  api.use("/users", usersRouter);
  api.use("/providers", providersRouter);
  api.use("/uploads", uploadsRouter);
  api.use("/brand-kits", brandKitsRouter);
  api.use("/banners", bannersRouter);
  api.use("/generations", generationsRouter);
  api.use("/files", filesRouter);

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
