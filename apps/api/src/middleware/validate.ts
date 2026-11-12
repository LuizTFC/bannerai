import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../utils/errors.js";

type Source = "body" | "query" | "params";

declare module "express-serve-static-core" {
  interface Request {
    validated: { body?: unknown; query?: unknown; params?: unknown };
  }
}

/** Validates a request part with a Zod schema and stores the parsed value in `req.validated`. */
export function validate<T>(schema: ZodType<T>, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    req.validated ??= {};
    req.validated[source] = result.data;
    next();
  };
}

export function getValidated<T>(req: { validated?: { body?: unknown; query?: unknown; params?: unknown } }, source: Source = "body"): T {
  return req.validated?.[source] as T;
}
