# Bannerai — production setup, scaling and unit economics

This is the recommended way to run Bannerai for real users in Brazil, Latin America and the US,
with the costs you can expect. Everything here is already supported by the code base; it is a
matter of configuration.

## Architecture in production

```
          ┌─────────────┐    HTTPS     ┌──────────────┐   pg-boss jobs   ┌───────────────┐
 Browser ─┤ Next.js web ├────────────►│ Express API  ├─────────────────►│ Worker(s)     │
          │ (Vercel)    │  /api        │ (Railway/Fly)│                  │ (Railway/Fly) │
          └─────────────┘              └──────┬───────┘                  └──────┬────────┘
                                              │ Prisma                           │ OpenAI / Gemini
                                       ┌──────▼───────┐                  ┌───────▼────────┐
                                       │ PostgreSQL   │                  │ Cloudflare R2  │
                                       │ (Neon)       │                  │ (images)       │
                                       └──────────────┘                  └────────────────┘
                                              ▲
                                       ┌──────┴───────┐
                                       │ Stripe       │ webhooks → /api/billing/webhook
                                       └──────────────┘
```

- **API** is stateless (sessions live in PostgreSQL): run 2+ instances behind the platform's
  load balancer. Set `RUN_WORKER=false` so API instances only enqueue.
- **Workers** (`npm run start:worker`) consume the PostgreSQL-backed queue (pg-boss). Each worker
  runs `WORKER_CONCURRENCY` generations in parallel (2–4 is a good start; the limiting factor is
  the provider's rate limit, not CPU). Add workers to add capacity; jobs survive restarts and a
  crashed worker's job is retried once, then failed with the credits returned.
- **Images** go to Cloudflare R2 (`STORAGE_PROVIDER=r2`): private bucket, the API hands out
  short-lived signed URLs, bytes never pass through Node. No egress fees.
- **Database**: managed PostgreSQL (Neon is the easiest: branching, autoscaling, backups).
- **Payments**: Stripe Checkout (cards everywhere, Pix in Brazil) with webhooks for fulfilment.

### Platform choice

| Component | Recommended | Why |
| --- | --- | --- |
| Web | Vercel (Hobby → Pro) | Native Next.js hosting, global CDN, zero config |
| API + workers | Railway (or Fly.io) | Separate services from one repo, autoscaling, simple env vars, Brazil/US regions |
| PostgreSQL | Neon | Serverless Postgres, free tier for launch, scales without migration |
| Images | Cloudflare R2 | 10 GB free, then US$ 0.015/GB·month, **no egress fees** (images are served a lot) |
| Payments | Stripe | Cards + Pix (BR), multi-currency, webhooks, invoices |
| Domain/DNS/CDN | Cloudflare | Free, same account as R2 |

Keep API and workers in the same region as the database (e.g. `us-east`, which also has the
lowest latency to OpenAI). Brazilian users talk to Vercel's edge and to one API region; the
~120 ms added latency is irrelevant next to 30–70 s generations.

## Step by step

1. **Database**: create a Neon project; copy the connection string into `DATABASE_URL`. Run
   `npm run db:migrate:deploy` from CI or once locally pointed at it.
2. **R2**: create bucket `bannerai`; create an API token with *Object Read & Write* on it; set
   `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
   To migrate existing local files, copy `apps/api/uploads/users/**` into the bucket keeping the
   same keys (`rclone copy apps/api/uploads r2:bannerai` works).
3. **API service** (Railway): new service from the GitHub repo with config file `railway.api.json`
   (builds `apps/api/Dockerfile`, runs `prisma migrate deploy` then the server, health check on
   `/api/health`). Env: everything from `.env.example`, `NODE_ENV=production`,
   `RUN_WORKER=false`, `FRONTEND_URL=https://app.yourdomain.com`, `API_PUBLIC_URL=https://api.yourdomain.com`,
   `SESSION_SECRET` (48 random bytes). Health check: `GET /api/health`.
4. **Worker service**: second service from the same repo with config file `railway.worker.json`
   (same image, runs `node dist/worker.js`), same env plus `RUN_WORKER=true`, `WORKER_CONCURRENCY=3`,
   at least 1 GB of memory. Scale replicas with demand.
5. **Web** (Vercel): import the repo with root directory `apps/web` (`apps/web/vercel.json` sets the
   build command), env `NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api`.
6. **Google OAuth**: add `https://api.yourdomain.com/api/auth/google/callback` to the authorized
   redirect URIs and `https://app.yourdomain.com` to the JavaScript origins; publish the consent screen.
7. **Stripe**: live keys in `STRIPE_SECRET_KEY`; add a webhook endpoint
   `https://api.yourdomain.com/api/billing/webhook` for `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.
   Enable Pix in Stripe → Settings → Payment methods (Brazilian Stripe account).
8. **Cookies across domains**: `app.` and `api.` on the same registrable domain are *same-site*,
   so the `SameSite=Lax` session cookie works as-is. If the API lives on a different domain, put it
   behind a path on the app domain instead (Vercel rewrite `/api/* → api host`).

Local webhook testing: `stripe listen --forward-to localhost:4000/api/billing/webhook` and copy
the printed `whsec_…` into `.env`. Without the CLI, the credits page still confirms the purchase
by asking the API to check the session status after redirect.

## Capacity and scaling notes

- **Exact faces** runs face detection/landmarks (`@vladmandic/human` on the TensorFlow.js WASM backend, models bundled in the package) inside the API/worker process: ~1 s to load on first use, then ~0.2 s per image plus the blend, well under 2 s per banner. A worker process peaks around 450 MB RSS with the models loaded, so budget ~500 MB per worker. Set `FACE_LOCK_PROVIDER=none` to skip it (faces then stay as the model painted them).

- A generation takes 30–75 s on GPT Image 2.5 Sunburst and holds one worker slot. 3 workers ×
  concurrency 3 ≈ 9 parallel generations ≈ 500–700 banners/hour. Watch the OpenAI rate limit for
  your tier and raise it in the OpenAI dashboard as you grow.
- The API itself does little work per request (uploads are validated with sharp; files go to R2).
  One small instance handles thousands of users; scale to 2 for availability.
- Rate limits are per user (generations/hour) and per IP (auth); tune them in
  `apps/api/src/middleware/rate-limit.ts`.
- Cost safety: every generation reserves credits first and releases them on failure, so the
  company never pays for a banner the user did not get, and users can never spend below zero
  (row-level lock on the balance). Set a monthly budget alert on the OpenAI account anyway.

## Unit economics

Measured provider costs (GPT Image 2.5 Sunburst, `quality=high`, Nov 2026):

| Action | Provider cost | Credits | Price (BRL, starter pack) | Price (USD) |
| --- | --- | --- | --- | --- |
| Generation | ≈ US$ 0.13 (R$ 0.73) | 3 | R$ 1.50 | US$ 0.37 |
| Edit | ≈ US$ 0.07 (R$ 0.39) | 2 | R$ 1.00 | US$ 0.25 |
| Prompt optimization + brand analysis | < US$ 0.01 | 0 | — | — |

A typical banner (1 generation + 3 edits) = 9 credits = **R$ 4.50** against ≈ R$ 1.90 of
provider cost (≈ 58% gross margin before fees). Ten edits still stay at R$ 11.50.

Credit packs (`packages/shared/src/constants/index.ts`):

| Pack | Credits | BRL | USD | Per credit (BRL) |
| --- | --- | --- | --- | --- |
| Starter | 20 | R$ 10 | US$ 2.49 | R$ 0.50 |
| Popular | 60 | R$ 25 | US$ 5.99 | R$ 0.42 |
| Pro | 150 | R$ 55 | US$ 12.99 | R$ 0.37 |

Stripe fees (Brazil): ≈ 3.99% + R$ 0.39 per card payment, ≈ 1.19% for Pix. On the R$ 25 pack:
R$ 1.39 (card) or R$ 0.30 (Pix). Free trial: 10 credits ≈ R$ 0.73 of provider cost per new account.

Fixed monthly costs at launch: Vercel Hobby (free) or Pro (US$ 20), Railway API + worker
(≈ US$ 10–25), Neon (free → US$ 19), R2 (free up to 10 GB; ≈ 300 banners/GB), Cloudflare DNS
(free). **≈ US$ 15–65/month** before any user; break-even at roughly 120 Popular packs/month
including fees and provider cost at the margins above.

Suggested levers once there is traction: raise edit price to 3 credits (edits are where most of
the spend happens), add a 300-credit pack for event organizers/agencies, and offer organization accounts
with shared credits.
