# Transcribe

Pay-as-you-go AI transcription. Users buy **credits** (Stripe), submit an
**audio/video file or a URL** (YouTube or any direct media link), pick a
**quality tier**, and get a transcript with timestamps plus TXT/SRT/VTT
export. Transcription runs on open-source Whisper (via
[faster-whisper](https://github.com/SYSTRAN/faster-whisper)) on the cheapest
compute available — serverless GPUs that bill by the second and scale to zero.

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
            gpu/ (RunPod Serverless, faster-whisper)   ← or local CPU/GPU
```

- **1 credit = 1 minute of Standard-tier audio.** Premium (Whisper `large-v3`)
  costs 2 credits/min. Rates, packs and the signup bonus live in
  `web/src/lib/pricing.ts`; the rate is frozen into each job at submission.
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
python3 -m venv .venv && .venv/bin/pip install -e ".[local]"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/transcribe \
  TRANSCRIBE_BACKEND=local WHISPER_MODEL_STANDARD=tiny \
  .venv/bin/python -m worker.main
```

Sign up (new accounts get 10 free credits), upload a clip or paste a URL, and
watch the job progress on the dashboard.

Dev conveniences (never enable in production):

| Env | Effect |
| --- | --- |
| `DEV_FAKE_CHECKOUT=1` | "Buy" buttons credit the account instantly, no Stripe |
| `TRANSCRIBE_BACKEND=fake` | Worker returns canned segments without any model |
| `SSRF_ALLOW_PRIVATE=1` | Allow URLs that resolve to private addresses |
| `WHISPER_MODEL_STANDARD=tiny` | Tiny model = fast CPU transcription for testing |

## Configuration

All knobs are environment variables — see [`.env.example`](.env.example) for
the full annotated list. Highlights:

- **Storage** — `STORAGE_DRIVER=local` (single machine, files under
  `data/uploads/`) or `s3` (any S3-compatible store; Cloudflare R2 is ideal —
  zero egress fees. MinIO ships in docker-compose: `docker compose --profile s3 up -d`).
- **Transcription** — `TRANSCRIBE_BACKEND=local` runs faster-whisper in the
  worker process (CPU or a local GPU); `runpod` sends audio to a RunPod
  Serverless endpoint (see [`gpu/README.md`](gpu/README.md); requires `s3`
  storage).
- **Stripe** — set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, point a
  webhook at `POST /api/stripe/webhook` for `checkout.session.completed`.
- **Limits** — `MAX_DURATION_SECONDS` (default 4 h), `MAX_FILESIZE_BYTES`
  (default 2 GB), `MAX_ACTIVE_JOBS_PER_USER` (default 3).

## Production deployment (reference setup)

| Piece | Suggested home | Notes |
| --- | --- | --- |
| `web/` | Vercel / Fly.io | any Node host; set env vars from `.env.example` |
| Postgres | Neon / Supabase / RDS | run `npm run db:migrate` on deploy |
| `worker/` | Fly.io / Railway / any VM | `worker/Dockerfile`; scale by adding instances |
| GPU | RunPod Serverless | build & push `gpu/`; scale-to-zero, per-second billing |
| Storage | Cloudflare R2 | `STORAGE_DRIVER=s3`, free egress to RunPod |

Rough unit economics: `large-v3` on an RTX 4090 serverless worker
(~$0.00031/s) transcribes at 10–20× realtime → **≈ $0.05–0.15 per audio-hour**
of GPU cost, while an hour of Premium sells for 120 credits (≈ $4.80 at the
Starter pack rate).

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
          transcribe (faster-whisper local or RunPod), credit settlement
gpu/      RunPod Serverless handler + Dockerfile (bakes Whisper models)
drizzle migrations: web/drizzle/   ·   compose stack: docker-compose.yml
```
