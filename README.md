# Transcribe

Pay-as-you-go AI transcription. Users buy **credits** (Stripe), submit an
**audio/video file or a URL** (YouTube or any direct media link), pick a
**quality tier** and language, and get a transcript with timestamps plus
TXT/SRT/VTT export. Transcription runs on managed speech-to-text APIs behind a
small provider interface, so swapping backends (or self-hosting faster-whisper)
is a config change.

- **Standard tier is language-routed**: [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR)
  for the languages it covers well (cheaper and more accurate, especially
  English and Asian languages), and Whisper large-v3-turbo via Groq for the
  long-tail languages Qwen doesn't support. The user's language choice at
  submission drives the routing; "Auto" stays on Qwen (which auto-detects).
- **Premium tier**: AssemblyAI, for best-in-class long-form accuracy.

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
  transcription API (Qwen / Groq / AssemblyAI)   ← routed by tier + language
```

- **1 credit = 1 minute of Standard-tier audio.** Premium costs 2 credits/min.
  Rates, packs and the signup bonus live in `web/src/lib/pricing.ts`; the rate
  is frozen into each job at submission.
- Credits are **held** when a job's duration is known (metadata probe — no
  full download needed for most URLs), **charged** for actual duration on
  completion (never more than the hold), and **fully refunded** on failure.
  Every movement is a row in `credit_ledger`; `SUM(delta)` always equals the
  user's balance.
- The worker claims jobs with `FOR UPDATE SKIP LOCKED` — run as many worker
  processes as you want, no extra queue infrastructure.
- Stripe Checkout handles payment; the webhook credits the account
  idempotently (unique `stripe_event_id`), so replayed deliveries are no-ops.

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
  GROQ_API_KEY=... ASSEMBLYAI_API_KEY=... \
  .venv/bin/python -m worker.main
```

Sign up (new accounts get 10 free credits), upload a clip or paste a URL, and
watch the job progress on the dashboard. No API keys handy? Run the worker with
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
  jobs go to Qwen (`QWEN_API_KEY`) unless the chosen language isn't in
  `QWEN_LANGUAGES`, in which case they fall back to `STANDARD_FALLBACK_BACKEND`
  (Groq, `GROQ_API_KEY`). Premium jobs go to `PREMIUM_BACKEND` (AssemblyAI,
  `ASSEMBLYAI_API_KEY`). Backends are `qwen | groq | assemblyai | local | fake`;
  `local` runs [faster-whisper](https://github.com/SYSTRAN/faster-whisper) in
  the worker (install `pip install ".[local]"`, set `WHISPER_MODEL_*`) — the
  genuinely-free self-hosted path. `TRANSCRIBE_BACKEND` forces every job onto one
  backend. Qwen's API caps requests at ~3 min, so the worker splits longer audio
  into `QWEN_CHUNK_SECONDS` chunks and stitches the timestamps back together.
- **Storage** — `STORAGE_DRIVER=local` (files under `data/uploads/`) is fine in
  production since the worker reads audio from disk; use `s3` (R2/MinIO/S3) only
  when web and worker run on separate machines. MinIO ships in docker-compose:
  `docker compose --profile s3 up -d`.
- **Stripe** — set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, point a
  webhook at `POST /api/stripe/webhook` for `checkout.session.completed`.
- **Limits** — `MAX_DURATION_SECONDS` (default 4 h), `MAX_FILESIZE_BYTES`
  (default 2 GB), `MAX_ACTIVE_JOBS_PER_USER` (default 3).

## Production deployment (reference setup)

| Piece | Suggested home | Notes |
| --- | --- | --- |
| `web/` | Vercel | any Node host; set env vars from `.env.example` |
| Postgres | Neon / Supabase / RDS | run `npm run db:migrate` on deploy |
| `worker/` | Railway / Render / any small VM | `worker/Dockerfile`; a long-lived poll loop, scale by adding instances |
| Transcription | Qwen + Groq + AssemblyAI | just API keys — no GPU infra to run |
| Storage | local disk, or Cloudflare R2 | R2 only if web/worker are on different hosts |

Rough unit economics: Groq transcribes Whisper large-v3-turbo at ~$0.04/audio-
hour and AssemblyAI Premium around $0.15–0.45/hour, versus an hour of Premium
that sells for 120 credits (≈ $4.80 at the Starter pack rate) — compute is a
low single-digit percentage of revenue.

## Security notes

- Passwords: argon2id; sessions: 256-bit tokens stored hashed, httpOnly cookies.
- User-supplied URLs are screened in the web app and re-checked with DNS
  resolution in the worker (`worker/worker/ssrf.py`) before anything is
  fetched. Run workers in a network segment without reachable internal
  services for defense in depth — DNS rebinding/redirects are otherwise
  still a residual risk.
- Upload keys are server-minted UUIDs; path traversal is rejected on both
  write and read.
- Stripe webhooks are signature-verified and idempotent by event id.
- Heads-up: downloading from YouTube may violate YouTube's Terms of Service,
  and datacenter IPs are frequently bot-checked; operating that feature is
  your responsibility (yt-dlp supports proxies/cookies if you need them).

## Repository layout

```
web/      Next.js 15 app — UI, auth, credits, Stripe, job API, Drizzle schema
worker/   Python worker — probe, download (yt-dlp), normalize (ffmpeg),
          transcribe (Qwen / Groq / AssemblyAI / local faster-whisper), settle
          worker/routing.py — tier + language → backend
          worker/providers/ — one module per transcription backend
drizzle migrations: web/drizzle/   ·   compose stack: docker-compose.yml
```
