# Bannerai — design note (2026-11-02)

Written under the working name "Church Banner Studio"; the product was renamed Bannerai on 2026-11-12.

The product brief in the original request is the approved specification. This note records
the engineering decisions that were not fixed by the brief.

## Stack and versions

- Monorepo with npm workspaces: `apps/web` (Next.js 16, App Router, Tailwind 4, shadcn/ui),
  `apps/api` (Express 5, Prisma 7 + `@prisma/adapter-pg`, Zod 4), `packages/shared` (types,
  enums, Zod schemas, API contracts — built with `tsc` to `dist`, consumed by both apps).
- TypeScript 5.9 (not the 7.x Go compiler) to keep tooling compatibility predictable.

## AI providers (verified against official docs on 2026-11-02)

- Gemini: Interactions API (`ai.interactions.create`) with `response_format: { type: "image",
  aspect_ratio, image_size }`. Default image model `gemini-nano-banana-2.1` (~$0.034 per 1K
  image, editing + up to 14 reference images). Text model for prompt optimization:
  `gemini-3.1-flash-lite`.
- OpenAI: Images API `images.generate` / `images.edit` (multipart, multiple input images).
  Default `gpt-image-2.5-flare`; `gpt-image-2.5-sunburst` for precision. Custom sizes
  (multiples of 16) map our aspect ratios: 1536×864, 864×1536, 1024×1024, 1280×960.
- Reference images (per-request uploads + Brand Kit logo/references) are sent to the image
  model as input images, not just described.
- Prompt pipeline: deterministic prompt composition (brief + settings + Brand Kit + language
  rules) → optional refinement by a text model that also extracts the exact on-banner text →
  image provider → sharp normalization to canonical PNG dimensions (1920×1080, 1080×1920,
  1080×1080, 1600×1200) → optional hybrid SVG text overlay ("Exact text overlay" setting).

## Async generation

Generation and edits return HTTP 202 immediately and run in an in-process queue
(concurrency 2). The frontend polls `GET /api/generations/:id` (through the banner query)
every 2 s. Interrupted jobs are marked failed on server restart so the UI never spins forever.

## Auth and security

- Passport Google OAuth 2.0 with `state: true` (session-stored state), express-session with
  `connect-pg-simple` (table created by Prisma migration), HttpOnly/SameSite=Lax cookies,
  secure in production, session regenerated at login, rolling expiration.
- CSRF: session-bound token returned by `GET /api/auth/me`, required in `x-csrf-token` for all
  state-changing requests, plus Origin/Referer check against `FRONTEND_URL`.
- Files live under `users/{userId}/…`; the authenticated file endpoint derives ownership from
  the key prefix and the storage layer rejects traversal twice (key grammar + resolved path).
- Helmet, CORS pinned to the frontend origin, rate limits (global, auth, generation, upload),
  uploads validated by decoding with sharp (MIME types from the client are never trusted).

## Data model

UUID keys everywhere; `banners.current_version_id` points at the active `banner_versions`
row; every generation (initial or edit) produces at most one version with
`parent_version_id` lineage; `reference_images` are per-request, `brand_kit_assets` are
permanent. JSONB only for `settings`, `usage` and `provider_metadata`.

## Local environment caveats found on the author's machine

- Port 5432 and port 3000 were already used by unrelated local services, so the compose file
  exposes `POSTGRES_PORT` and the Docker image is configurable through `POSTGRES_IMAGE`.
