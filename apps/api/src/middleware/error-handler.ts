import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError, NotFoundError } from "../utils/errors.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError("Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({ error: { code: "validation_error", message: "Validation failed", details: err.issues } });
    return;
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: { code: "upload_error", message: err.code === "LIMIT_FILE_SIZE" ? `File exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit` : err.message } });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, path: req.path }, err.message);
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.expose ? err.message : "Internal server error",
        ...(err.expose && err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // body-parser errors (malformed JSON, too large)
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "bad_request", message: "Malformed JSON body" } });
    return;
  }
  if (anyErr?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "payload_too_large", message: "Request body is too large" } });
    return;
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "internal_error",
      message: env.isProduction ? "Internal server error" : (anyErr?.message ?? "Internal server error"),
    },
  });
};
