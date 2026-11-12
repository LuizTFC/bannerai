import { randomUUID } from "node:crypto";
import cookieSignature from "cookie-signature";
import sharp from "sharp";
import request from "supertest";
import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from "@bannerai/shared";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import type { User } from "../generated/prisma/client.js";

export async function createUser(overrides: Partial<{ email: string; name: string; googleId: string; creditBalance: number }> = {}): Promise<User> {
  const suffix = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      googleId: overrides.googleId ?? `google-${suffix}`,
      email: overrides.email ?? `user-${suffix}@example.com`,
      name: overrides.name ?? `Test User ${suffix}`,
      // Generous default so unrelated tests never hit the paywall; credit tests set their own balance
      creditBalance: overrides.creditBalance ?? 1000,
      trialGrantedAt: new Date(),
    },
  });
}

export interface AuthContext {
  user: User;
  cookie: string;
  csrfToken: string;
}

/**
 * Creates a real server-side session for the user (same shape express-session + passport write)
 * and returns the signed cookie plus the CSRF token so tests can call protected endpoints.
 */
export async function authenticate(user: User): Promise<AuthContext> {
  const sid = randomUUID();
  const csrfToken = randomUUID().replace(/-/g, "");
  const expire = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      sid,
      expire,
      sess: {
        cookie: { originalMaxAge: 3600000, expires: expire.toISOString(), httpOnly: true, path: "/", sameSite: "lax" },
        passport: { user: user.id },
        csrfToken,
      },
    },
  });
  const signed = `s:${cookieSignature.sign(sid, env.SESSION_SECRET)}`;
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(signed)}`, csrfToken };
}

export async function authedUser(): Promise<AuthContext> {
  return authenticate(await createUser());
}

/** Applies session cookie + CSRF header + Origin to a supertest request. */
export function withAuth<T extends request.Test>(req: T, auth: AuthContext): T {
  return req.set("Cookie", auth.cookie).set(CSRF_HEADER_NAME, auth.csrfToken).set("Origin", env.FRONTEND_URL) as T;
}

export async function pngBuffer(width = 64, height = 64, color = { r: 120, g: 60, b: 200 }): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

export async function jpegBuffer(width = 64, height = 64): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor<T>(fn: () => Promise<T | null | undefined>, { timeoutMs = 10_000, intervalMs = 50 } = {}): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("waitFor timed out");
    await sleep(intervalMs);
  }
}
