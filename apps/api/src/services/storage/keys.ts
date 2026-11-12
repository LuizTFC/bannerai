import { randomUUID } from "node:crypto";
import path from "node:path";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const extensionForMime = (mimeType: string): string => EXTENSIONS[mimeType] ?? "bin";

/**
 * Storage keys are always relative, forward-slash separated, and scoped under `users/{userId}/`.
 * Only a conservative character set is allowed, which rules out path traversal (`..`), absolute
 * paths and hidden files.
 */
const SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function isSafeStorageKey(key: string): boolean {
  if (typeof key !== "string" || key.length === 0 || key.length > 512) return false;
  if (key.includes("\\") || key.includes("\0")) return false;
  const segments = key.split("/");
  if (segments.length < 3 || segments[0] !== "users") return false;
  return segments.every((s) => SEGMENT_RE.test(s) && s !== "." && s !== "..");
}

export function assertSafeStorageKey(key: string): void {
  if (!isSafeStorageKey(key)) throw new Error(`Unsafe storage key: ${key}`);
}

/** Returns the user id that owns a storage key, or null if the key is malformed. */
export function ownerOfKey(key: string): string | null {
  if (!isSafeStorageKey(key)) return null;
  return key.split("/")[1] ?? null;
}

/** Produces a safe file name: `<uuid>.<ext>`; the original name is kept in the database. */
export function safeFileName(mimeType: string): string {
  return `${randomUUID()}.${extensionForMime(mimeType)}`;
}

export const storageKeys = {
  reference: (userId: string, mimeType: string) => `users/${userId}/references/${safeFileName(mimeType)}`,
  brandKit: (userId: string, mimeType: string) => `users/${userId}/brand-kit/${safeFileName(mimeType)}`,
  bannerVersion: (userId: string, bannerId: string, versionNumber: number) =>
    `users/${userId}/banners/${bannerId}/v${versionNumber}-${randomUUID().slice(0, 8)}.png`,
  bannerPrefix: (userId: string, bannerId: string) => `users/${userId}/banners/${bannerId}/`,
  userPrefix: (userId: string) => `users/${userId}/`,
};

export const sanitizeOriginalName = (name: string): string => {
  const base = path.basename(name || "image").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return base || "image";
};
