import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSafeStorageKey, ownerOfKey, storageKeys } from "./keys.js";
import { LocalStorageProvider } from "./local-storage.js";

describe("storage keys", () => {
  it("accepts well-formed user-scoped keys", () => {
    expect(isSafeStorageKey("users/abc-123/references/file.png")).toBe(true);
    expect(isSafeStorageKey(storageKeys.bannerVersion("u1", "b1", 3))).toBe(true);
    expect(ownerOfKey("users/u1/banners/b1/v1.png")).toBe("u1");
  });

  it("rejects traversal, absolute paths and keys outside the users namespace", () => {
    for (const key of ["../etc/passwd", "users/../../etc/passwd", "/users/u1/a.png", "users/u1/../u2/a.png", "users/u1/.hidden", "other/u1/a.png", "users/u1", "users/u1/a\\b.png", "users/u1/a\0.png", ""]) {
      expect(isSafeStorageKey(key), key).toBe(false);
      expect(ownerOfKey(key), key).toBeNull();
    }
  });
});

describe("LocalStorageProvider", () => {
  let root: string;
  let storage: LocalStorageProvider;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "cbs-storage-"));
    storage = new LocalStorageProvider(root);
  });
  afterEach(async () => fs.rm(root, { recursive: true, force: true }));

  it("writes, reads, streams and deletes objects", async () => {
    const key = "users/u1/references/a.png";
    const data = Buffer.from("hello");
    const stored = await storage.put(key, data, "image/png");
    expect(stored).toEqual({ key, sizeBytes: 5, mimeType: "image/png" });
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.get(key)).toString()).toBe("hello");
    const { stream, sizeBytes } = await storage.stream(key);
    expect(sizeBytes).toBe(5);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("hello");
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it("deletes a whole prefix", async () => {
    await storage.put("users/u1/banners/b1/v1.png", Buffer.from("1"), "image/png");
    await storage.put("users/u1/banners/b1/v2.png", Buffer.from("2"), "image/png");
    await storage.put("users/u1/banners/b2/v1.png", Buffer.from("3"), "image/png");
    await storage.deletePrefix(storageKeys.bannerPrefix("u1", "b1"));
    expect(await storage.exists("users/u1/banners/b1/v1.png")).toBe(false);
    expect(await storage.exists("users/u1/banners/b2/v1.png")).toBe(true);
  });

  it("refuses unsafe keys", async () => {
    await expect(storage.put("../escape.png", Buffer.from("x"), "image/png")).rejects.toThrow(/Unsafe/);
    await expect(storage.get("users/u1/../../etc/passwd")).rejects.toThrow(/Unsafe/);
  });
});
