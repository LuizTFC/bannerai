import { Readable } from "node:stream";
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeStorageKey } from "./keys.js";
import type { StorageProvider, StoredObject } from "./types.js";

export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Seconds a signed download URL stays valid. */
  signedUrlTtlSeconds?: number;
}

/**
 * Cloudflare R2 (S3-compatible, no egress fees). Objects are private; the API hands out
 * short-lived signed URLs so image bytes never flow through the Node process.
 */
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly ttl: number;

  constructor(options: R2Options) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
    this.bucket = options.bucket;
    this.ttl = options.signedUrlTtlSeconds ?? 3600;
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<StoredObject> {
    assertSafeStorageKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType, CacheControl: "private, max-age=31536000" }));
    return { key, sizeBytes: data.byteLength, mimeType };
  }

  async get(key: string): Promise<Buffer> {
    assertSafeStorageKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty object: ${key}`);
    return Buffer.from(bytes);
  }

  async stream(key: string): Promise<{ stream: Readable; sizeBytes: number }> {
    assertSafeStorageKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = res.Body as Readable | undefined;
    if (!body) throw new Error(`Empty object: ${key}`);
    return { stream: body instanceof Readable ? body : Readable.from(body as AsyncIterable<Uint8Array>), sizeBytes: res.ContentLength ?? 0 };
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if ((err as { name?: string }).name === "NotFound" || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertSafeStorageKey(prefix.replace(/\/$/, ""));
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  /** Short-lived URL the browser can fetch directly (optionally forcing a download file name). */
  async signedUrl(key: string, options: { downloadName?: string; mimeType?: string } = {}): Promise<string> {
    assertSafeStorageKey(key);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options.mimeType ? { ResponseContentType: options.mimeType } : {}),
      ...(options.downloadName ? { ResponseContentDisposition: `attachment; filename="${options.downloadName}"` } : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: this.ttl });
  }
}
