import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";

const skip = () => env.isTest;

const message = { error: { code: "rate_limited", message: "Too many requests, please slow down." } };

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  message,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  message,
});

/** Generation is expensive: cap how many jobs a single session can start per hour. */
export const generationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "0.0.0.0"),
  message: { error: { code: "rate_limited", message: "Generation limit reached for this hour. Please try again later." } },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "0.0.0.0"),
  message,
});
