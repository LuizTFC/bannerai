# Bannerai

An AI banner studio for any event or organization — tech conferences and meetups, schools, small businesses,
NGOs, festivals. Describe an event or campaign in English, Portuguese or Spanish, pick a Brand Kit
and an aspect ratio, add reference banners, generate a professional banner with Google Gemini or
OpenAI, refine it by talking to the AI, and download the final PNG — no designer required.

Brand identity (name, mark, colors, voice) is documented in [`docs/brand.md`](docs/brand.md).

## Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Environment configuration](#environment-configuration)
- [PostgreSQL and Docker Compose](#postgresql-and-docker-compose)
- [Prisma migrations](#prisma-migrations)
- [Google OAuth configuration](#google-oauth-configuration)
- [AI provider configuration](#ai-provider-configuration)
- [Running the apps](#running-the-apps)
- [Running tests](#running-tests)
- [API reference](#api-reference)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [What still needs external configuration](#what-still-needs-external-configuration)

## Overview

| Feature | How it works |
| --- | --- |
| Sign in with Google | Google OAuth 2.0 handled by the Express backend; server-side sessions stored in PostgreSQL; HttpOnly cookies |
| Create Banner | Prompt + aspect ratio (16:9, 9:16, 1:1, 4:3) + optional **banner elements** (guest photos, band/sponsor logos, products — content that must appear, each with a caption) + optional reference images (style only) + optional advanced settings (colors, font, design style, text position, logo placement, extra instructions, exact-text overlay). **Exact faces** (default when elements are attached): the model paints the guests from their photos (so clothes, pose and size stay editable by prompt) and the studio then puts each real face back, aligned on the painted face's landmarks and tone-matched; the lock runs again after every edit |
| AI generation | Deterministic prompt composition → optional prompt optimization by a text model → image model (Gemini Nano Banana or OpenAI GPT Image) → PNG normalization with sharp |
| Conversational editing | Each instruction sends the current image to the provider's edit endpoint and creates a new version; previous versions are never modified |
| Versions | Browse, compare side-by-side, restore, download, or continue editing from any version |
| Brand Kits | Several reusable identities per account (organization, event, brand, client): logo, colors, fonts, reference banners and guidelines. The default kit is applied automatically; any kit can be chosen per banner. The logo can be placed by the AI or composited exactly by the studio at a chosen corner |
| Feedback loop | Approving a version after revisions makes a text model turn the change requests (plus first vs final image) into reusable rules stored on the Brand Kit ("learned preferences"), injected into every future generation and editable on the Brand Kit page. The approved PNG is also added to the kit's references |
| Brand visual system | When reference banners are added to a kit, a text model extracts the organization's design system (layout, typography, colors, recurring devices, imagery, logo usage, mood, don'ts). It is persisted on the kit, shown on the Brand Kit page, and injected as mandatory rules into every generation. Any reference can also be picked as the **template** for a banner, and the model is told to reproduce its structure |
| My Banners | Responsive grid with thumbnails, status, aspect ratio, provider, version count, download and delete |
| Security | OAuth state validation, CSRF tokens, CORS pinned to the frontend, rate limiting, Zod validation, uploads decoded and re-encoded, per-user authorization on every resource and file |
| Credits & payments | Pay-as-you-go credits, no subscription: free trial on first login, then credit packs via Stripe Checkout (cards everywhere, Pix in Brazil). A generation reserves credits before running and returns them if it fails; balances are updated under a row lock so concurrent requests cannot overspend. Animated public landing page (parallax hero, scroll-linked reveals, self-playing refine demo, pricing) built with `motion` |
| Scalability | Durable PostgreSQL-backed job queue (pg-boss): any number of stateless API instances enqueue, any number of worker processes generate in parallel. Cloudflare R2 storage adapter with signed URLs. See [`docs/production.md`](docs/production.md) |
| Languages | Interface in English, Portuguese (Brazil) and Spanish — detected from the browser, switchable from the user menu or Settings, saved on the account. Banners are generated in the language of the prompt (pt-BR, en or es) |
| Resolution | Gemini renders at 2K and OpenAI at canvas-sized custom dimensions, then sharp normalizes to 1920×1080 / 1080×1920 / 1080×1080 / 1600×1200 PNG without upscaling |

## Architecture

Two independently deployable applications plus a shared package, managed with npm workspaces:

```text
bannerai/
├── apps/
│   ├── web/        Next.js 16 (App Router) — UI only, talks to the API over HTTP
│   └── api/        Express 5 + Prisma 7 + PostgreSQL — all business logic, auth, AI, storage
├── packages/
│   └── shared/     TypeScript types, enums, Zod schemas and API contracts used by both apps
├── docker-compose.yml   PostgreSQL for local development
├── .env.example         All configuration (copy to .env)
└── docs/superpowers/specs/   Design notes
```

- **Frontend** (`apps/web`): React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query,
  React Hook Form, Zod. No API routes, no server actions, no database access. A typed API client
  (`src/lib/api`) wraps `fetch` with cookie credentials and the CSRF header. UI strings live in
  `src/lib/i18n/dictionaries` (`en`, `pt-BR`, `es`); add a key to `en.ts` and TypeScript forces the
  other dictionaries to provide it.
- **Backend** (`apps/api`): modular structure (`modules/auth`, `users`, `banners`, `generations`,
  `brand-kit`, `uploads`, `ai-providers`, `files`, `health`), `services/storage` (interchangeable
  storage with a local filesystem implementation), `services/image` (sharp processing and the SVG
  text overlay), `middleware` (auth, CSRF, validation, rate limiting, error handling).
- **AI providers**: `ImageGenerationProvider` interface with `generateImage`, `editImage` and an
  optional `generateText` (prompt optimization). Implementations: `GeminiProvider` and
  `OpenAiProvider`. Switching provider/model never touches business logic.
- **Generation jobs**: `POST /api/banners` and `POST /api/banners/:id/edits` return `202` right
  away; an in-process queue runs the pipeline and the UI polls the generation status, so provider
  latency never hits HTTP timeouts.

## Prerequisites

- Node.js 22 or newer (developed with Node 24) and npm 10+
- Docker Desktop (for PostgreSQL) — or any PostgreSQL 14+ instance
- A Google Cloud project for OAuth credentials
- An API key for Google Gemini and/or OpenAI

## Quick start

```bash
git clone <this repository> bannerai
cd bannerai
cp .env.example .env            # then fill in SESSION_SECRET, Google OAuth and AI keys (see below)
npm install
npm run db:up                   # starts PostgreSQL in Docker
npm run db:migrate              # applies Prisma migrations (and generates the client)
npm run dev                     # starts the API (4000) and the web app (3000)
```

Open <http://localhost:3000>, sign in with Google, and create your first banner.

## Environment configuration

Copy `.env.example` to `.env` at the repository root. Both apps and Docker Compose read it.

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | Backend base URL seen by the browser (`http://localhost:4000/api`) |
| `NODE_ENV` | no | `development` (default), `test` or `production` |
| `PORT` | no | API port (default `4000`) |
| `FRONTEND_URL` | yes | Allowed CORS origin and OAuth redirect target (`http://localhost:3000`) |
| `API_PUBLIC_URL` | no | Public URL of the API, used to build the OAuth callback (default `http://localhost:<PORT>`) |
| `DATABASE_URL` | yes | PostgreSQL connection string used by Prisma and the session store |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_IMAGE` | no | Docker Compose settings for the local database |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for sign-in | Google OAuth 2.0 web client credentials |
| `SESSION_SECRET` | yes | At least 32 random characters (`openssl rand -base64 48`) |
| `SESSION_TTL_HOURS` | no | Session lifetime, default 168 (7 days), rolling |
| `ALLOWED_EMAIL_DOMAINS` | no | Comma-separated list; when set, only these Google account domains can sign in |
| `GEMINI_API_KEY` | one of | Google AI Studio key |
| `OPENAI_API_KEY` | one of | OpenAI key |
| `DEFAULT_AI_PROVIDER` | no | `gemini` (default) or `openai` |
| `GEMINI_IMAGE_MODEL`, `GEMINI_TEXT_MODEL` | no | Defaults `gemini-3-pro-image` and `gemini-3.1-flash-lite` |
| `GEMINI_IMAGE_SIZE` | no | `1K`, `2K` (default) or `4K`; 1K outputs get upscaled to the final canvas and lose crispness |
| `OPENAI_IMAGE_MODEL`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_QUALITY` | no | Defaults `gpt-image-2.5-sunburst`, `gpt-5-mini` and `high` |
| `DEFAULT_IMAGE_MODEL` | no | Overrides the default provider's image model |
| `ENABLE_PROMPT_OPTIMIZATION` | no | `true` (default) runs the text model before image generation |
| `STORAGE_PROVIDER`, `STORAGE_LOCAL_PATH` | no | `local` (default, files under `apps/api/uploads`) or `r2` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_SIGNED_URL_TTL_SECONDS` | for r2 | Cloudflare R2 credentials and bucket |
| `QUEUE_DRIVER`, `RUN_WORKER`, `WORKER_CONCURRENCY`, `GENERATION_TIMEOUT_SECONDS` | no | `pgboss` (default) or `memory`; whether the API consumes jobs; parallel jobs per worker |
| `CREDIT_COST_GENERATION`, `CREDIT_COST_EDIT`, `TRIAL_CREDITS` | no | Credit pricing (3 / 2 / 10 by default) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for purchases | Stripe API key and webhook signing secret |
| `MAX_UPLOAD_SIZE_MB` | no | Per-file upload limit, default 10 |

The API validates the environment at startup and exits with a readable list of problems.
Missing Google or AI credentials produce warnings in development and hard errors in production.

## PostgreSQL and Docker Compose

```bash
npm run db:up      # docker compose up -d postgres
npm run db:down    # docker compose down (data persists in the `postgres-data` volume)
```

The compose file runs `postgres:17-alpine` with a health check and a persistent volume. Host port
and image are configurable with `POSTGRES_PORT` and `POSTGRES_IMAGE`, which is handy when another
PostgreSQL already uses 5432: set `POSTGRES_PORT=5433` and change the port in `DATABASE_URL`.

You can also point `DATABASE_URL` at any existing PostgreSQL server; Docker is not required to
run the frontend or the backend.

## Prisma migrations

```bash
npm run db:migrate          # prisma migrate dev  (creates/applies migrations, regenerates the client)
npm run db:migrate:deploy   # prisma migrate deploy (production / CI)
npm run db:generate         # prisma generate
npm run db:studio           # Prisma Studio
```

The schema lives in `apps/api/prisma/schema.prisma`; migrations in `apps/api/prisma/migrations`.
Tables: `users`, `session` (express-session store), `banners`, `banner_generations`,
`banner_versions`, `reference_images`, `brand_kits`, `brand_kit_assets`. The generated client is
written to `apps/api/src/generated/prisma` (git-ignored) by `prisma generate`, which runs as part
of `npm run build`, `npm run typecheck` and `npm run db:migrate`.

## Google OAuth configuration

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a
   project.
2. Go to **APIs & Services → OAuth consent screen**. Choose *External* (or *Internal* for a
   Google Workspace domain), fill in the app name and support email, and add the scopes
   `.../auth/userinfo.email` and `.../auth/userinfo.profile`. While the app is in *Testing*
   status, add the Google accounts of your team as test users.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000` and `http://localhost:4000`
   - **Authorized redirect URIs**: `http://localhost:4000/api/auth/google/callback`
     (the callback is served by the Express backend, not by Next.js)
4. Copy the client ID and client secret into `.env` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, and restart the API.
5. In production, add `https://<your-api-domain>/api/auth/google/callback` as a redirect URI and
   set `API_PUBLIC_URL` and `FRONTEND_URL` accordingly.

The flow: the login page links to `GET /api/auth/google`; Passport stores a random `state` in
the session and redirects to Google; Google calls back `GET /api/auth/google/callback`; the
backend verifies the state, creates or updates the user, regenerates the session and redirects to
`FRONTEND_URL/create`. `GET /api/auth/me` returns the user and the CSRF token; `POST
/api/auth/logout` destroys the session.

Optionally set `ALLOWED_EMAIL_DOMAINS=yourcompany.com` to restrict sign-in to your domain.

## AI provider configuration

At least one provider must be configured to generate banners. Model names were verified against
the official documentation on 2026-11-02; adjust the variables if the providers rename models.

### Google Gemini (default, cost-effective)

1. Create a key in [Google AI Studio](https://aistudio.google.com/).
2. Set `GEMINI_API_KEY`.
3. Image model: `gemini-3-pro-image` (Nano Banana Pro, default) — Google's premium model, best
   typography and reference following, up to 14 input images, ~$0.13 per image. Cheaper models
   (`gemini-nano-banana-2.1`, `gemini-3.1-flash-lite-image`) still work through `GEMINI_IMAGE_MODEL`.
   Prompt optimization uses `gemini-3.1-flash-lite`.

### OpenAI (higher-fidelity alternative)

1. Create a key on the [OpenAI platform](https://platform.openai.com/).
2. Set `OPENAI_API_KEY`.
3. Image model: `gpt-image-2.5-sunburst` (default) — the most precise GPT Image model, rendered
   at `OPENAI_IMAGE_QUALITY=high`. `gpt-image-2.5-flare` (faster) still works through
   `OPENAI_IMAGE_MODEL`. Prompt optimization uses `gpt-5-mini`.

The UI does not expose a model choice: every generation uses the provider set in
`DEFAULT_AI_PROVIDER` (OpenAI by default, after side-by-side testing). The API still accepts an
optional `provider`/`model` per request, and the backend records provider, model, duration, token
usage and an estimated cost for every generation.

### How images are produced

1. The request is validated with the shared Zod schema.
2. The user's Brand Kit (logo, references, colors, fonts, guidelines) and per-request reference
   images are loaded from storage.
3. A deterministic creative prompt is composed from the brief, plus a **non-negotiable
   constraints block** (palette, typography, organization, brand guidelines, logo rule, reference
   rules, text/language rules, format). Explicit user settings override Brand Kit defaults.
4. If prompt optimization is enabled, a text model sees the brief, the constraints and the
   reference images, rewrites the creative prompt, describes the references' visual language and
   extracts the exact on-banner text. The constraints block is appended verbatim after the
   optimized prompt so brand rules survive optimization. If the model fails, the deterministic
   prompt is used.
5. The image provider is called with the prompt and all reference images (logo, Brand Kit
   references, per-request references) as actual labeled inputs.
6. The result is normalized with sharp to a canonical PNG (1920×1080, 1080×1920, 1080×1080 or
   1600×1200).
7. If **Logo placement** is set to a corner, the backend composites the exact logo file at that
   corner (with a soft backdrop) — the model is told to leave that area clean. If **Exact text
   overlay** was enabled (a fallback mode), the model paints artwork only and the backend overlays
   the title/subtitle/details as vector text.
8. The PNG is stored under `uploads/users/<userId>/banners/<bannerId>/`, a `banner_versions` row
   is created, and the banner's current version is updated.

Edits send the selected version's PNG plus an instruction (with the original brief and the
previous edit instructions as context) to the provider's edit endpoint and create a new version.

## Credits, Stripe and scaling

- **Costs**: `CREDIT_COST_GENERATION` (default 3) and `CREDIT_COST_EDIT` (default 2) credits;
  `TRIAL_CREDITS` (default 10) are granted once per account on first sign-in. Packs and their
  prices per currency live in `packages/shared/src/constants/index.ts`.
- **Stripe**: set `STRIPE_SECRET_KEY`; create a webhook for `checkout.session.completed` and
  `checkout.session.async_payment_succeeded` pointing at `POST /api/billing/webhook` and put its
  signing secret in `STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:4000/api/billing/webhook`.
  Without a webhook the credits page confirms the purchase by checking the session after redirect.
- **Queue**: `QUEUE_DRIVER=pgboss` (default) stores jobs in PostgreSQL (schema `pgboss`, created
  automatically). In development the API also consumes jobs (`RUN_WORKER=true`). In production set
  `RUN_WORKER=false` on the API and run `npm run start:worker` (or `npm run dev:worker`) in as many
  processes as you need, each with `WORKER_CONCURRENCY` parallel generations.
- **Storage**: `STORAGE_PROVIDER=r2` with the `R2_*` variables uses Cloudflare R2; files are
  served through short-lived signed URLs. `local` keeps files under `apps/api/uploads`.
- Hosting recommendation, step by step and unit economics: [`docs/production.md`](docs/production.md).

## Running the apps

```bash
npm run dev        # API + web concurrently (builds the shared package first)
npm run dev:api    # API only  → http://localhost:4000/api  (health: /api/health)
npm run dev:web    # web only  → http://localhost:3000
npm run build      # shared + API (tsc) + web (next build)
npm run typecheck  # type-check everything
npm run lint       # eslint for the web app
```

Production: `npm run build`, then `npm run start -w apps/api` (serves `dist/server.js`) and
`npm run start -w apps/web`. Set `NODE_ENV=production`, HTTPS URLs, and `secure` cookies will be
enforced automatically.

## Running tests

```bash
npm test                 # all workspaces
npm run test -w apps/api # backend integration + unit tests (vitest + supertest)
```

The backend tests run against a real PostgreSQL database named `bannerai_test`
(derived from `DATABASE_URL`, override with `TEST_DATABASE_URL`). Create it once:

```bash
docker compose exec postgres psql -U postgres -c "CREATE DATABASE bannerai_test;"
```

Migrations are applied automatically before the suite. Tests cover authentication and sessions,
CSRF, protected endpoints, user ownership of banners/files/generations, request validation, the
provider abstraction and prompt builder, the generation pipeline (with an in-memory stub
provider), version creation/lineage/restore, Brand Kit persistence, uploads and storage safety.

## API reference

All routes are under `/api`. Private routes require the session cookie; state-changing routes
also require the `x-csrf-token` header (value from `GET /api/auth/me`).

| Method | Route | Description |
| --- | --- | --- |
| GET | `/health` | Backend status, database connectivity, version |
| GET | `/auth/status` | Whether Google sign-in is configured |
| GET | `/auth/google` | Starts Google OAuth |
| GET | `/auth/google/callback` | OAuth callback (configured in Google Cloud) |
| GET | `/auth/me` | Current user + CSRF token |
| POST | `/auth/logout` | Destroys the session |
| PATCH | `/users/me/settings` | Default provider/model/aspect ratio/language |
| GET | `/providers` | Available providers, models and configuration status |
| POST | `/uploads/references?kind=reference\|element` | Multipart `files[]`; `reference` = style inspiration, `element` = content that must appear in the banner |
| PATCH | `/uploads/references/:id` | Update an element's caption |
| DELETE | `/uploads/references/:id` | Removes an uploaded reference |
| GET | `/brand-kits` · POST `/brand-kits` | List / create Brand Kits |
| GET | `/brand-kits/:id` · PATCH `/brand-kits/:id` · DELETE `/brand-kits/:id` | Read / update / delete a kit |
| POST | `/brand-kits/:id/default` · POST `/brand-kits/:id/clear` · POST `/brand-kits/:id/analyze` | Set as default / clear a field / re-run the visual-system analysis |
| POST | `/brand-kits/:id/logo` · POST `/brand-kits/:id/references` · DELETE `/brand-kits/:id/assets/:assetId` | Kit assets |
| GET | `/banners?page=&pageSize=` | Paginated list |
| POST | `/banners` | Creates a banner and queues the first generation (202) |
| GET | `/banners/:id` | Banner with versions, generations, references, active generation |
| PATCH | `/banners/:id` | Rename |
| DELETE | `/banners/:id` | Delete banner, versions and files |
| POST | `/banners/:id/edits` | Conversational edit → new version (202) |
| POST | `/banners/:id/generations/:generationId/retry` | Retry a failed generation (202) |
| POST | `/banners/:id/restore` | Make a previous version current |
| POST | `/banners/:id/approve` | Mark a version as final; learns preferences into the Brand Kit and adds the PNG as a reference |
| GET | `/generations/:id` | Generation status (polled by the UI) |
| GET | `/files/users/:userId/...` | Authenticated file access (stream, or 302 to a signed R2 URL); `?download=name.png` forces download |
| GET | `/billing/pricing` | Public pricing: costs, trial, packs, whether purchases are enabled |
| GET | `/billing/credits` | Balance and ledger |
| POST | `/billing/checkout` | Creates a Stripe Checkout session for a pack (`{ packId, currency? }`) |
| GET | `/billing/checkout/:sessionId` | Confirms a session after redirect (fallback when webhooks are not configured) |
| POST | `/billing/webhook` | Stripe webhook (raw body, signature-verified, idempotent) |

Errors use `{ "error": { "code", "message", "details?" } }`. Internal errors never expose stack
traces in production.

## Project layout

```text
apps/api/src
├── app.ts / server.ts        Express app factory and HTTP server
├── config/                   env validation (zod) and logger (pino)
├── database/prisma.ts        Prisma client (pg adapter)
├── middleware/               csrf, require-auth, validate, rate-limit, error-handler
├── modules/
│   ├── ai-providers/         provider interface, Gemini, OpenAI, registry, prompt builder/optimizer
│   ├── auth/                 passport (Google), session store, routes
│   ├── banners/              repository, service, mapper (DTOs), routes
│   ├── generations/          job queue, pipeline, status route
│   ├── brand-kit/, uploads/, users/, files/, health/
├── services/storage/         StorageProvider interface + local filesystem implementation
├── services/image/           sharp processing, SVG text overlay
└── test/                     helpers, stub provider, global setup

apps/web/src
├── app/                      routes: /login, /create, /banners, /banners/[id], /brand-kit, /settings
├── proxy.ts                  cookie-presence redirect to /login
├── components/               studio (form, aspect ratio cards, uploader, advanced settings),
│                             editor (chat, versions, compare), banners, brand-kit, settings, layout, ui
└── lib/api/                  typed client, endpoints, TanStack Query hooks
```

## Troubleshooting

- **`Cannot connect to PostgreSQL`** at API start — run `npm run db:up` and check
  `DATABASE_URL` (port must match `POSTGRES_PORT`).
- **`P1010: User was denied access`** during migrations — another PostgreSQL is listening on the
  same port with different credentials; change `POSTGRES_PORT`/`DATABASE_URL` (e.g. 5433).
- **Port 3000 already in use** — Next.js picks another port; also update `FRONTEND_URL` (CORS and
  OAuth redirects use it) or free the port.
- **Google login shows `redirect_uri_mismatch`** — the redirect URI in Google Cloud must be
  exactly `http://localhost:4000/api/auth/google/callback`.
- **"Google sign-in is not configured"** — set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and
  restart the API.
- **"No AI provider is configured"** — set `GEMINI_API_KEY` or `OPENAI_API_KEY`.
- **Generation fails with a provider error** — the message is shown in the Refine panel with a
  Retry button; check the API logs for the provider status code (401 = bad key, 429 = rate limit).
- **Images do not load in the browser** — image URLs are authenticated; the browser must send the
  session cookie to `localhost:4000`, which works for same-site localhost. If you serve the
  frontend from a different site in production, put both behind the same domain (e.g.
  `/api` reverse proxy) or adjust the cookie `domain`.
- **Docker image pull is slow** — set `POSTGRES_IMAGE` to any cached `postgres:*` image.

## What still needs external configuration

The code is complete, but these require credentials that only you can provide:

1. **Google OAuth** — create the client described above and fill `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`. The sign-in flow was implemented and exercised at the HTTP level in the
   test suite, but it has not been run against real Google credentials yet.
2. **AI providers** — set `GEMINI_API_KEY` and/or `OPENAI_API_KEY`. The integrations follow the
   current official SDKs and documentation; the pipeline was verified end to end with an
   in-memory stub provider in the automated tests. The first real generation will confirm the
   model names still match your account's access.
