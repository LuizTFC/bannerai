import { Router } from "express";
import passport from "passport";
import { SESSION_COOKIE_NAME, type MeResponse } from "@bannerai/shared";
import { env } from "../../config/env.js";
import { getCsrfToken } from "../../middleware/csrf.js";
import { authRateLimiter } from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { AppError, ServiceUnavailableError } from "../../utils/errors.js";
import { creditsService } from "../credits/credits.service.js";
import { toUserDto, usersService } from "../users/users.service.js";

export const authRouter = Router();

const loginRedirect = (reason: string) => `${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`;

authRouter.get("/status", (_req, res) => {
  res.json({ googleConfigured: env.googleOAuthConfigured });
});

authRouter.get("/google", authRateLimiter, (req, res, next) => {
  if (!env.googleOAuthConfigured) {
    next(new ServiceUnavailableError("Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."));
    return;
  }
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })(req, res, next);
});

authRouter.get("/google/callback", authRateLimiter, (req, res, next) => {
  if (!env.googleOAuthConfigured) {
    res.redirect(loginRedirect("not_configured"));
    return;
  }
  passport.authenticate("google", (err: unknown, user: Express.User | false | undefined) => {
    if (err) {
      const reason = err instanceof AppError && err.status === 403 ? "domain_not_allowed" : "oauth_failed";
      res.redirect(loginRedirect(reason));
      return;
    }
    if (!user) {
      res.redirect(loginRedirect("oauth_denied"));
      return;
    }
    // req.logIn regenerates the session (prevents fixation) and persists the user id.
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        next(loginErr);
        return;
      }
      req.session.loginAt = Date.now();
      getCsrfToken(req);
      req.session.save(() => res.redirect(`${env.FRONTEND_URL}/create`));
    });
  })(req, res, next);
});

authRouter.get("/me", requireAuth, async (req, res) => {
  // Free trial credits are granted exactly once, the first time the account is seen.
  let user = req.user!;
  if (!user.trialGrantedAt && (await creditsService.grantTrial(user.id)) > 0) user = (await usersService.findById(user.id)) ?? user;
  const body: MeResponse = { user: toUserDto(user), csrfToken: getCsrfToken(req) };
  res.json(body);
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
      return;
    }
    req.session.destroy(() => {
      res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      res.status(204).end();
    });
  });
});
