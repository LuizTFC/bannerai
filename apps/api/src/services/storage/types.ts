import type { Readable } from "node:stream";

export interface StoredObject {
  key: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageProvider {
  /** Persists a buffer under `key` and returns the stored object metadata. */
  put(key: string, data: Buffer, mimeType: string): Promise<StoredObject>;
  /** Reads the whole object into memory. */
  get(key: string): Promise<Buffer>;
  /** Streams the object (used by the file endpoint). */
  stream(key: string): Promise<{ stream: Readable; sizeBytes: number }>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Deletes every object under a prefix (e.g. a banner folder). */
  deletePrefix(prefix: string): Promise<void>;
  /** Optional: a short-lived URL the browser can fetch directly (object storage). */
  signedUrl?(key: string, options?: { downloadName?: string; mimeType?: string }): Promise<string>;
}
