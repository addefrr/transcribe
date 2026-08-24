# Transcribe

AI transcription with pay-as-you-go credits or time-limited plans. Users submit an
**audio/video file or a URL** (YouTube or any direct media link), pick a
**quality tier** and language, and get a transcript with timestamps plus
TXT/SRT/VTT export. Transcription runs on managed speech-to-text APIs behind a
small provider interface, so swapping backends (or self-hosting faster-whisper)
is a config change.

- **Standard tier**: Whisper large-v3-turbo through Groq's synchronous API.
- **Premium tier**: Soniox `stt-async-v5`, including optional speaker labels.

## How it works

```
Browser ──► web/ (Next.js: auth, credits, Stripe, job API)
                 │            ▲
                 ▼            │ status / transcript
             Postgres (jobs table doubles as the queue)
                 ▲            │
                 │            ▼
            worker/ (Python: yt-dlp ▸ ffmpeg ▸ transcribe ▸ settle credits)
                 │
                 ▼
       transcription API (Groq / Soniox)         ← routed by tier
```

- The default configuration uses **1 credit per started Standard minute** and
  **2 credits per started Premium minute**. Rates, packs, plan allowances, and
  the verified-email signup bonus are editable in the developer portal; the
  applicable rate is frozen into each submitted job.
- Credits and subscription minutes are **reserved** when duration is known,
  charged for actual duration on completion (never more than the reservation),
  and released on failure. URL jobs stop after an isolated worker-side duration
  check so the customer can review the exact plan/backup-credit split before
  paid transcription begins.
  Every movement is a row in `credit_ledger`; `SUM(delta)` always equals the
  user's balance.
- The worker claims jobs with `FOR UPDATE SKIP LOCKED` — run as many worker
  processes as you want, no extra queue infrastructure. A user-row lock keeps
  playlist jobs within `MAX_ACTIVE_JOBS_PER_USER` even across many workers.
- Stripe Checkout handles payments and subscriptions. Signed webhooks record
  purchases and renewals idempotently, so replayed deliveries are no-ops.

## Local development

Prereqs: Node 20+, Python 3.11+, `ffmpeg`, Postgres (or Docker).

```sh
# 1. Postgres
docker compose up -d postgres          # or point DATABASE_URL at your own

# 2. Web app
cd web
cp ../.env.example .env                # adjust as needed
npm install
npm run db:migrate                     # applies drizzle/ SQL migrations
npm run dev                            # http://localhost:3000

# 3. Worker (separate shell)
cd worker
python3 -m venv .venv && .venv/bin/pip install -e .
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transcribe \
  GROQ_API_KEY=... SONIOX_API_KEY=... \
  .venv/bin/python -m worker.main
```

Sign up and verify the email address (verified new accounts get 10 free credits),
upload a clip or paste a URL, and watch the job progress on the dashboard. No API
keys handy? Run the worker with
`TRANSCRIBE_BACKEND=fake` to exercise the whole flow with canned transcripts.

Dev conveniences (never enable in production):

| Env | Effect |
| --- | --- |
| `DEV_FAKE_CHECKOUT=1` | "Buy" buttons credit the account instantly, no Stripe |
| `TRANSCRIBE_BACKEND=fake` | Worker returns canned segments, no API keys needed |
| `SSRF_ALLOW_PRIVATE=1` | Allow URLs that resolve to private addresses |

## Configuration

All knobs are environment variables — see [`.env.example`](.env.example) for
the full annotated list. Highlights:

- **Transcription** — routing lives in `worker/worker/routing.py`. Standard-tier
  jobs use Groq Whisper Large V3 Turbo (`GROQ_API_KEY`); Premium jobs use Soniox
  async v5 (`SONIOX_API_KEY`), with optional speaker diarization. Hosted backends
  are `groq | soniox`; development backends are `local | fake`.
  Production routing is deliberately limited to Groq and Soniox. `local` and
  `fake` remain development/test overrides and are not customer-selectable.
  Set `GROQ_MAX_UPLOAD_BYTES=26214400` when using Groq Free; the example uses
  the documented 100 MB developer-tier ceiling.
- **Storage** — `STORAGE_DRIVER=local` stores files under `data/uploads/` and is
  suitable only when the web and worker share the same persistent filesystem.
  Use `s3` (R2/MinIO/S3) for separate or serverless hosts. MinIO ships in
  docker-compose: `docker compose --profile s3 up -d`.
- **Stripe** — set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, point a
  webhook at `POST /api/stripe/webhook`, and subscribe to the event list printed
  by `make connect`.
- **Limits** — `MAX_DURATION_SECONDS` (default 4 h), `MAX_FILESIZE_BYTES`
  (default 2 GB), `MAX_ACTIVE_JOBS_PER_USER` (default 3),
  `MAX_JOB_SUBMISSIONS_PER_HOUR` (default 30), and `MAX_PLAYLIST_ITEMS`
  (default 100).

## Production deployment (reference setup)

Run `make providers` for direct links to Cloudflare, R2, PostgreSQL, Groq,
Soniox, Stripe, and Resend. `make connect` prints the exact configuration order
and Stripe webhook events; `make production-check` validates configured values
without printing secrets.

### Cloudflare status

Cloudflare DNS/CDN and R2 object storage can be used now, but `web/` is **not
currently deploy-ready for Cloudflare Workers**. This repository has no
OpenNext adapter dependency or `wrangler`/OpenNext deployment configuration,
`@node-rs/argon2` relies on a native N-API module that workerd does not support,
and the Workers Free 10 ms CPU allowance is unsuitable or at least unverified
for password hashing and this app's dynamic SSR/authentication paths. A normal
successful `next build` verifies the Node.js target only; it does not verify a
Workers bundle or runtime.

Until those blockers are deliberately migrated and tested, deploy `web/` to a
Node.js host and put the public domain behind Cloudflare if desired. Keep R2 for
shared object storage and run `worker/` on a separate container/VM. Do not add an
OpenNext adapter and assume parity: authentication, database connectivity,
uploads, Stripe webhooks, headers, and runtime CPU limits all need a real
Workers build and production-like verification first.

| Piece | Suggested home | Notes |
| --- | --- | --- |
| `web/` | Node.js host (current verified target) | Cloudflare Workers/OpenNext migration is pending; set all values from `.env.example` |
| Postgres | Neon / Supabase / RDS | run `npm run db:migrate` on deploy |
| `worker/` | Railway / Render / any small VM | `worker/Dockerfile`; a long-lived poll loop, scale by adding instances |
| Transcription | Groq + Soniox | just API keys — no GPU infra to run |
| DNS/CDN and storage | Cloudflare + R2 | Usable now; R2 is required when web and worker do not share a filesystem |

Provider-cost assumptions used by the developer dashboard are configuration,
not customer promises. Recheck them against current Groq and Soniox invoices
before changing prices or allowances.

## Security notes

- Passwords: argon2id; sessions: 256-bit tokens stored hashed, httpOnly cookies.
- User-supplied URLs are screened in the web app and re-checked with DNS
  resolution in the worker (`worker/worker/ssrf.py`) before anything is
  fetched. Run workers in a network segment without reachable internal
  services for defense in depth — DNS rebinding/redirects are otherwise
  still a residual risk.
- Upload keys are server-minted UUIDs and bound to one verified account, exact
  byte size, expiry, and single job. Path traversal is rejected on write/read,
  and the worker verifies object size again immediately before download.
- Stripe webhooks are signature-verified and idempotent by event id.
- Heads-up: downloading from YouTube may violate YouTube's Terms of Service,
  and datacenter IPs are frequently bot-checked; operating that feature is
  your responsibility (yt-dlp supports proxies/cookies if you need them).

## Repository layout

```
web/      Next.js 15 app — UI, auth, credits, Stripe, job API, Drizzle schema
worker/   Python worker — probe, download (yt-dlp), normalize (ffmpeg),
          transcribe (Groq / Soniox / local faster-whisper), settle
          worker/routing.py — tier → backend
          worker/providers/ — one module per transcription backend
drizzle migrations: web/drizzle/   ·   compose stack: docker-compose.yml
```
