import type { RequestHandler } from "express";
import { UnauthorizedError } from "../utils/errors.js";

/** Ensures the request has an authenticated user attached to the session. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  next();
};
