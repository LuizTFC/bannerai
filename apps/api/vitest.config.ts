import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Derive the test database from the developer's DATABASE_URL (same host/credentials, "_test" suffix).
dotenv.config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? (process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/bannerai").replace(/\/[^/?]+(\?|$)/, "/bannerai_test$1");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      SESSION_SECRET: "test-session-secret-test-session-secret-123456",
      FRONTEND_URL: "http://localhost:3000",
      STORAGE_LOCAL_PATH: "./.test-uploads",
      LOG_LEVEL: "silent",
      DEFAULT_AI_PROVIDER: "gemini",
      QUEUE_DRIVER: "memory",
      FACE_LOCK_PROVIDER: "none",
      STRIPE_SECRET_KEY: "sk_test_dummy_key_for_signature_tests",
      STRIPE_WEBHOOK_SECRET: "whsec_test_dummy_secret",
      TRIAL_CREDITS: "10",
      CREDIT_COST_GENERATION: "3",
      CREDIT_COST_EDIT: "2",
      GEMINI_API_KEY: "",
      OPENAI_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  },
});
