import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Applies migrations to the dedicated test database before the suite runs. */
export default function globalSetup(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(here, "../..");
  dotenv.config({ path: path.resolve(apiRoot, "../../.env"), quiet: true });
  const base = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/bannerai";
  const url = process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/bannerai_test$1");
  execSync("npx prisma migrate deploy", { cwd: apiRoot, stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
