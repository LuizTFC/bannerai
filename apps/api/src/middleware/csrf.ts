import { randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { CSRF_HEADER_NAME } from "@bannerai/shared";
import { env } from "../config/env.js";
import { ForbiddenError } from "../utils/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Returns (and lazily creates) the CSRF token bound to the current session. */
export function getCsrfToken(req: { session: { csrfToken?: string } }): string {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

function sameToken(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Double protection for state-changing requests:
 *  1. The Origin (or Referer) header, when present, must match the configured frontend.
 *  2. The request must carry the session-bound CSRF token in the `x-csrf-token` header.
 * Paths listed in `exemptPaths` (OAuth redirects) are skipped.
 */
export function csrfProtection(options: { exemptPaths?: RegExp[] } = {}): RequestHandler {
  const frontendOrigin = new URL(env.FRONTEND_URL).origin;
  const exempt = options.exemptPaths ?? [];
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (exempt.some((re) => re.test(req.path))) return next();
    // Unauthenticated requests are rejected by requireAuth with a 401, which the client
    // understands as "sign in again"; a CSRF 403 here would only mask that.
    if (!req.user) return next();

    const origin = req.get("origin") ?? (req.get("referer") ? new URL(req.get("referer")!).origin : undefined);
    if (origin && origin !== frontendOrigin) {
      return next(new ForbiddenError("Cross-site request blocked"));
    }

    if (!req.session) return next(new ForbiddenError("Missing session"));
    const expected = req.session.csrfToken;
    const provided = req.get(CSRF_HEADER_NAME);
    if (!expected || !provided || !sameToken(expected, provided)) {
      return next(new ForbiddenError("Invalid or missing CSRF token"));
    }
    next();
  };
}
