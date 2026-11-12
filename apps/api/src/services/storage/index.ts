import { env } from "../../config/env.js";
import { LocalStorageProvider } from "./local-storage.js";
import { R2StorageProvider } from "./r2-storage.js";
import type { StorageProvider } from "./types.js";

export * from "./types.js";
export * from "./keys.js";
export { LocalStorageProvider } from "./local-storage.js";

export { R2StorageProvider } from "./r2-storage.js";

export function createStorageProvider(): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case "r2":
      return new R2StorageProvider({
        accountId: env.R2_ACCOUNT_ID!,
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        bucket: env.R2_BUCKET!,
        signedUrlTtlSeconds: env.R2_SIGNED_URL_TTL_SECONDS,
      });
    case "local":
    default:
      return new LocalStorageProvider(env.storageRoot);
  }
}

export const storage: StorageProvider = createStorageProvider();
