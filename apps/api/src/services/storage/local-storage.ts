import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { assertSafeStorageKey } from "./keys.js";
import type { StorageProvider, StoredObject } from "./types.js";

/**
 * Local filesystem storage. All keys are resolved under `root`, and the resolved path is
 * verified to stay within `root` as a second line of defense against traversal.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeStorageKey(key);
    const abs = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (!abs.startsWith(rootWithSep)) throw new Error("Resolved path escapes storage root");
    return abs;
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<StoredObject> {
    const abs = this.resolve(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    return { key, sizeBytes: data.byteLength, mimeType };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async stream(key: string): Promise<{ stream: Readable; sizeBytes: number }> {
    const abs = this.resolve(key);
    const stat = await fs.stat(abs);
    return { stream: createReadStream(abs), sizeBytes: stat.size };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const normalized = prefix.replace(/\/$/, "");
    assertSafeStorageKey(normalized);
    const abs = this.resolve(normalized);
    await fs.rm(abs, { recursive: true, force: true });
  }
}
