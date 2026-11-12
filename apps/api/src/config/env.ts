import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Load the repository-root .env first (shared by all apps), then an app-local one if present.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../../.env"), quiet: true });
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true, override: true });

const booleanFromString = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  API_PUBLIC_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (postgresql://user:pass@host:port/db)"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must have at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),

  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEFAULT_AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  DEFAULT_IMAGE_MODEL: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().optional(),
  GEMINI_TEXT_MODEL: z.string().optional(),
  GEMINI_IMAGE_SIZE: z.enum(["1K", "2K", "4K"]).default("2K"),
  OPENAI_IMAGE_MODEL: z.string().optional(),
  OPENAI_TEXT_MODEL: z.string().optional(),
  OPENAI_IMAGE_QUALITY: z.enum(["low", "medium", "high", "xhigh", "auto"]).default("high"),
  ENABLE_PROMPT_OPTIMIZATION: booleanFromString,

  STORAGE_PROVIDER: z.enum(["local", "r2"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Jobs
  QUEUE_DRIVER: z.enum(["pgboss", "memory"]).default("pgboss"),
  /** Face detector behind "exact faces": `human` (bundled models, WASM backend) or `none` (faces are left as painted). */
  FACE_LOCK_PROVIDER: z.enum(["human", "none"]).default("human"),
  RUN_WORKER: booleanFromString.transform((v) => v ?? true),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  GENERATION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(600),

  // Credits & payments
  CREDIT_COST_GENERATION: z.coerce.number().int().min(0).default(3),
  CREDIT_COST_EDIT: z.coerce.number().int().min(0).default(2),
  TRIAL_CREDITS: z.coerce.number().int().min(0).default(10),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  APP_VERSION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  isProduction: boolean;
  isTest: boolean;
  googleOAuthConfigured: boolean;
  apiPublicUrl: string;
  storageRoot: string;
  maxUploadBytes: number;
};

function emptyToUndefined(input: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input)) out[k] = v === "" ? undefined : v;
  return out;
}

const packageVersion = (): string | undefined => {
  try {
    return (createRequire(import.meta.url)("../../package.json") as { version?: string }).version;
  } catch {
    return undefined;
  }
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(emptyToUndefined(source));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\n\nCopy .env.example to .env and fill in the required values.`);
  }
  const env = parsed.data;
  const warnings: string[] = [];
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    warnings.push("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set: Google sign-in will be unavailable.");
  }
  if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) {
    warnings.push("Neither GEMINI_API_KEY nor OPENAI_API_KEY is set: banner generation will be unavailable.");
  }
  if (!env.STRIPE_SECRET_KEY) warnings.push("STRIPE_SECRET_KEY is not set: credit purchases will be unavailable (trial credits still work).");
  if (env.STORAGE_PROVIDER === "r2" && (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET)) {
    throw new Error("STORAGE_PROVIDER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET");
  }
  if (env.NODE_ENV === "production" && warnings.length > 0) {
    throw new Error(`Invalid production configuration:\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
  for (const w of warnings) {
    if (env.NODE_ENV !== "test") console.warn(`[config] WARNING: ${w}`);
  }

  // Relative storage paths resolve against the API app directory (apps/api), which owns the files.
  const apiRoot = path.resolve(here, "../../");
  const storageRoot = path.isAbsolute(env.STORAGE_LOCAL_PATH)
    ? env.STORAGE_LOCAL_PATH
    : path.resolve(apiRoot, env.STORAGE_LOCAL_PATH);

  return {
    ...env,
    APP_VERSION: env.APP_VERSION ?? packageVersion(),
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    googleOAuthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    apiPublicUrl: (env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, ""),
    storageRoot,
    maxUploadBytes: Math.round(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024),
  };
}

export const env: Env = loadEnv();
