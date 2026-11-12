import path from "node:path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

// The repository-root .env is the single source of configuration for both apps.
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const nextConfig: NextConfig = {
  // The studio is a fully client-rendered, cookie-authenticated app that talks to the
  // Express API, so component-level caching does not add value here.
  cacheComponents: false,
  transpilePackages: ["@bannerai/shared"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
