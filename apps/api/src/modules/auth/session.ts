import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { SESSION_COOKIE_NAME } from "@bannerai/shared";
import { env } from "../../config/env.js";
import { pgPool } from "../../database/prisma.js";

const PgStore = connectPgSimple(session);

export function createSessionMiddleware() {
  const ttlMs = Math.round(env.SESSION_TTL_HOURS * 60 * 60 * 1000);
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    store: new PgStore({
      pool: pgPool,
      tableName: "session",
      createTableIfMissing: false, // created by Prisma migrations
      pruneSessionInterval: env.isTest ? false : 60 * 15,
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: env.isProduction,
    cookie: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax",
      maxAge: ttlMs,
      path: "/",
    },
  });
}
