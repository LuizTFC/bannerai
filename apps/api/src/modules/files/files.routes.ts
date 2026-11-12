import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { storage, isSafeStorageKey, ownerOfKey } from "../../services/storage/index.js";
import { ForbiddenError, NotFoundError } from "../../utils/errors.js";

export const filesRouter = Router();

const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Authenticated file access. Keys are always `users/{userId}/...`, so ownership is enforced by
 * comparing the key's owner with the session user. The storage layer re-validates the key.
 */
filesRouter.get(/^\/(.+)$/, requireAuth, async (req, res, next) => {
  try {
    const key = decodeURIComponent((req.params as unknown as string[])[0] ?? "");
    if (!isSafeStorageKey(key)) throw new NotFoundError("File not found");
    if (ownerOfKey(key) !== req.user!.id) throw new ForbiddenError();
    if (!(await storage.exists(key))) throw new NotFoundError("File not found");

    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    if (storage.signedUrl) {
      const name = typeof req.query.download === "string" ? req.query.download.replace(/[^\w.\-]/g, "_").slice(0, 100) || "banner.png" : undefined;
      res.setHeader("Cache-Control", "private, no-store");
      res.redirect(302, await storage.signedUrl(key, { downloadName: name, mimeType: mime }));
      return;
    }
    const { stream, sizeBytes } = await storage.stream(key);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(sizeBytes));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (typeof req.query.download === "string") {
      const name = req.query.download.replace(/[^\w.\-]/g, "_").slice(0, 100) || "banner.png";
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    }
    stream.on("error", next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});
