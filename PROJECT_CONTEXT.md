# Transcribe — Project Context (handoff)

This document is a complete orientation for an agent (or engineer) picking up
this codebase cold. It explains what the product is, how the system fits
together, the data model, the money/billing logic, how to run and test it, and
the conventions to follow. Pair it with `README.md` (user-facing overview) and
the source it points to.

---

## 1. What it is

A **pay-as-you-go AI transcription** web service. Users buy **credits** (Stripe)
or take a **subscription**, submit an **audio/video file, a URL (YouTube or any
direct media link), an in-browser recording, or a playlist**, pick a **quality
tier** and language, and receive a transcript with timestamps, optional speaker
labels, in-page audio playback, and TXT/SRT/VTT export. Transcripts can be filed
into colored folders and shared via public read-only links. A browser extension
transcribes audio/video playing on any web page.

Two moving parts:

- **`web/`** — Next.js 15 (App Router, React 19, TypeScript, Tailwind v4).
  Auth, credits/Stripe, subscriptions, the job API, the customer UI, and an
  admin "developer portal". Talks to Postgres via Drizzle ORM (postgres-js).
- **`worker/`** — Python. Long-running poll loop that claims jobs from Postgres,
  downloads/normalizes media (yt-dlp + ffmpeg), transcribes via a pluggable
  provider, writes the transcript, and settles billing.

```
Browser ─► web/ (Next.js: auth, credits, Stripe, job API, admin) ─► Postgres
                                                                      ▲   │
                                        jobs table doubles as queue   │   ▼
                                                                   worker/ (Python)
                                     yt-dlp ▸ ffmpeg ▸ ASR provider ▸ settle credits
                                                                          │
                                             Groq / Soniox / local  ◄┘
```

There is **no separate queue or job runner** — the `jobs` table *is* the queue
(`SELECT ... FOR UPDATE SKIP LOCKED`). The worker also handles playlist
expansion (`job_batches`) and a periodic audio-retention sweep.

---

## 2. Repo layout

```
web/                     Next.js app
  src/app/               App Router routes (pages + /api route handlers + server actions)
    (auth)/              login, signup, forgot/reset password, verify-email, auth actions
    api/                 jobs, uploads, probe, stripe, subscribe, folders, share, content...
    developer/           admin-only portal (stats) + settings (editable config)
    dashboard, credits, plans, jobs/[id], batches/[id], share/[shareId]
  src/components/        React components (client + shared)
  src/lib/               schema (Drizzle), auth, settings, content, pricing, credits,
                         subscriptions, wallet, storage, ssrf, languages, tokens, ...
  drizzle/               hand-written SQL migrations + meta/_journal.json
worker/worker/           main.py (poll loop), pipeline.py, db.py, media.py, storage.py,
                         routing.py, ssrf.py, config.py, providers/ (groq,
                         soniox, local, fake)
extension/               MV3 browser extension (transcribe tab audio) — see extension/README.md
Makefile                 make dev / update / migrate / stop / logs ...
docker-compose.yml       Postgres (+ optional MinIO) for local dev
.env.example             every env var, documented
README.md                user-facing overview
```

Migrations are **hand-written** SQL in `web/drizzle/NNNN_name.sql` with a
matching entry appended to `web/drizzle/meta/_journal.json`; apply with
`npx drizzle-kit migrate` (or `make migrate`). Do **not** rely on
`drizzle-kit generate`.

---

## 3. Data model (`web/src/lib/schema.ts`)

- **users** — `id, email (unique), passwordHash (argon2id), emailVerified,
  creditBalance, createdAt`. The configured signup-credit bonus is granted only
  on the first successful email verification.
- **sessions** — `id = sha256(cookie token)`, `userId, expiresAt`. Cookie-based
  auth; the DB only stores the hash.
- **auth_tokens** — one-time email verify / password-reset tokens (sha256 stored,
  `kind`, `expiresAt`, `usedAt`, single-use).
- **api_tokens** — long-lived API keys for the browser extension / API clients
  (sha256 stored, `name`, `lastUsedAt`). Bearer-auth.
- **credit_ledger** — append-only. `delta` (credits ±), `reason`
  (`signup_bonus | purchase | hold | refund | subscription`), `amountUsdCents`
  (set on money-in rows), `jobId`, `stripeEventId` (webhook idempotency).
  `users.creditBalance` is updated in the same transaction as every insert, so
  `SUM(delta) == creditBalance` always.
- **jobs** — the unit of work AND the queue. Key columns: `sourceType
  (upload|url)`, `sourceUrl`, `sourceVideoId` (`"<extractor>:<id>"`, for
  transcript reuse), `uploadKey`, `originalFilename`, `outputName` (display/
  download name), `tier`, `creditsPerMinute`, `billing (credits|subscription)`,
  `subscriptionId`, `batchId` (playlist child), `folderId`, `diarize`,
  `costPerMinuteCents`/`estCostCents` (our estimated cost), `languageHint`,
  `status (pending→probing→downloading→transcribing→completed|failed)`,
  `durationSeconds`, `creditsHeld`/`creditsCharged`,
  `subscriptionMinutesHeld`/`subscriptionMinutesCharged`, `language`, `error`,
  `audioKey`/`audioExpiresAt` (retained playback audio), `shareId` (public link),
  `requiresConfirmation`/`confirmedAt`, `provider`/`model`/`resultSource`,
  `claimedAt`. Indexes drive the queue poll and the account-scoped reuse lookup.
- **transcripts / transcript_revisions** — current text and timestamped segments,
  plus reversible snapshots written before customer edits.
- **uploads** — expiring, single-use upload intents bound to account, object key,
  declared byte size, filename, and content type.
- **rate_limits** — hashed shared abuse-control buckets used across web instances.
- **folders** — user folders with a `color` tag; `jobs.folderId` is `ON DELETE
  SET NULL` (deleting a folder un-files, never deletes transcripts).
- **settings** — `key (pk) → value jsonb`. Admin-editable config; overlaid on
  code defaults (see §6).
- **subscriptions** — one active row per user. `planId, tier, interval
  (month|year|week), status, allowanceMinutes, minutesUsed,
  allowancePeriodStart/End, periodStart/End, stripeSubscriptionId`. Fair-use is
  metered by `minutesUsed` vs `allowanceMinutes`. Annual plans are billed yearly
  but reset the same monthly allowance as their matching monthly plan.
- **job_batches** — a playlist submission: worker expands it (yt-dlp flat) into
  `items jsonb`, user confirms the total price, then one job per item is created
  under `batchId`.

---

## 4. Job lifecycle (worker)

`worker/worker/main.py` runs a resilient poll loop (reconnects on any
`psycopg.Error`, never dies on a bad iteration). Each tick: sweep stale jobs +
expired audio, claim a playlist batch to expand, else claim a job. `pipeline.py`:

1. **Probe.** URL → `media.probe_url` (yt-dlp metadata: duration, title, and a
   canonical `"<extractor>:<id>"`). Upload → fetch the file from storage and
   `media.probe_file` (ffprobe; falls back to **decoding** the audio when the
   container has no duration, e.g. browser MediaRecorder WebM). Title is saved as
   `output_name`; the video id as `source_video_id`.
2. **Confirm URL work.** A new URL job stops at `awaiting_confirmation`
   after the worker-side probe. The customer sees duration, plan minutes, and
   backup credits before explicitly starting paid speech recognition.
3. **Reserve usage.** Credits and/or subscription minutes are reserved
   transactionally. A clip that crosses the allowance boundary uses the
   remaining plan minutes plus backup credits; concurrent jobs cannot spend the
   same allowance.
4. **Transcript reuse.** If `settings.reuseTranscripts` is on and the same
   account already transcribed the same `source_video_id` at the same tier/diarize/language,
   copy that transcript (and its audio) and complete — charging normally
   (`complete_job` bills identically). Skips download/normalize/transcribe.
5. **Download** (`media.download_url`, size-capped) if not an upload.
   Upload objects are checked against their server-recorded exact size again at
   the worker boundary.
6. **Normalize** to mono Opus (`media.normalize`); its ffprobe duration is what
   we bill.
7. **Transcribe** via the routed provider and snapshot provider/model provenance.
8. **Settle**: charge actual started minutes against the reservation, release
   any remainder, and store the
   transcript.
9. **Retain audio** (`storage.persist` → `audio/<jobId>.ogg`, TTL) for playback.

Failures call `db.fail_job` (release the hold) and delete the source upload.
A `_Heartbeat` thread refreshes `claimed_at` so long jobs aren't requeued.

---

## 5. Billing & money

- **Credits.** `estimateCredits(durationSeconds, creditsPerMinute)` =
  `ceil(minutes) × cpm` (`web/src/lib/pricing.ts`), matched by the worker's
  `credits_for`. Hold at submit, settle at completion, refund the difference.
  Ledger is the source of truth.
- **Purchases.** Stripe Checkout for packs (`/api/stripe/checkout`) and a
  custom amount; a webhook (`/api/stripe/webhook`, idempotent on
  `stripeEventId`) grants credits. `DEV_FAKE_CHECKOUT=1` credits instantly in dev.
- **Subscriptions.** Plans have explicit, admin-editable minute allowances;
  entitlements never change as a side effect of a cost estimate. Monthly and
  annual plans for a tier receive the same monthly allowance. One-time week
  passes have a seven-day allowance. Usage is reserved before provider spend,
  with any overage drawn from backup credits.
- **Spend wallet** (`web/src/lib/wallet.ts`). Recorded payment value = credit
  purchases + subscription payments; new Stripe entries are tax-exclusive when
  event data permits, while historical/fallback rows can include tax. Spend =
  `sum(jobs.est_cost_cents)`. Projected provider cost is reserved under a shared
  PostgreSQL advisory lock before any remote ASR call, so concurrent web and
  worker processes cannot each spend the same remaining budget. A pre-provider
  failure releases the reservation; after `provider_started_at` it is retained
  conservatively and the request is not replayed automatically. This is an
  operational guardrail, not profit or an accounting balance, and it only trips
  once payment value is positive. Deletion first rolls financial/usage amounts
  into unlinkable additive `platform_metrics`, so removing customer-linked rows
  does not silently rewrite lifetime economics.

---

## 6. Settings & content (admin-editable)

- **`web/src/lib/settings.ts`** — `DEFAULT_SETTINGS` holds code defaults;
  `getSettings()` overlays per-key rows from the `settings` table (5s cache);
  the developer form writes its complete settings/copy snapshot atomically.
  Tunables: tiers
  (label/creditsPerMinute/description), packs, signup bonus, price-per-credit,
  min purchase, per-tier compute cost, subscription plans (price/explicit allowance),
  `developerSubscriptionBypass` (admin demo mode), `walletSpendPct`,
  `reuseTranscripts`.
- **`web/src/lib/content.ts`** — client-safe **content dictionary**: every
  user-facing string as namespaced defaults (`nav`, `landing`, `dashboard`,
  `newJob`, `auth`, `plans`, `credits`, `jobDetail`, ...). `{placeholder}`
  templates filled by `fill()`. `getContent()` deep-merges DB overrides
  (`mergeContent`); `<ContentProvider>`/`useContent()` deliver it to client
  components; server components call `getContent()` directly. Admins edit copy in
  `/developer/settings` (Text category) and inline via an "Edit text" mode.
- **`pricing.ts`** is the client-safe half of settings (types + pure helpers, no
  DB import) so client components can import pricing primitives.

---

## 7. Transcription providers & routing

`worker/worker/routing.py` maps `(tier, languageHint)` → `(backend, model)`:

- **Standard**: **Groq Whisper Large V3 Turbo** for every supported language.
- **Premium**: **Soniox `stt-async-v5`**, with optional speaker diarization that
  produces segment `speaker` labels.
- `local` (self-hosted faster-whisper) and `fake` (deterministic, for tests)
  exist. `TRANSCRIBE_BACKEND=<name>` forces one backend for everything.

Providers implement a small interface returning `{language, segments:[{start,
end,text,speaker?}]}`.

---

## 8. Storage & SSRF

- `web/src/lib/storage.ts` (Node) and `worker/worker/storage.py` (Python) share
  the **same `UPLOAD_DIR`**, resolved against the **repo root** (not each
  process's cwd) so the web app (cwd `web/`) and worker (cwd `worker/`) always
  agree. `STORAGE_DRIVER=local|s3`. Upload keys are `<uuid>.<ext>`, minted
  server-side.
- URL submissions are screened for SSRF twice: fast syntactic check in the web
  (`web/src/lib/ssrf.ts`), authoritative DNS-resolving check in the worker
  (`worker/worker/ssrf.py`). `SSRF_ALLOW_PRIVATE=1` for local testing only.

---

## 9. Auth & security

- Password hashing: argon2id (`@node-rs/argon2`, OWASP params).
- Sessions: random token in an httpOnly cookie; DB stores only its sha256.
- Email verification + password reset via one-time hashed tokens
  (`web/src/lib/tokens.ts`) and Resend (`web/src/lib/email.ts`). Missing
  email configuration logs links only in development and fails closed in production.
- PostgreSQL-backed, hashed-key rate limiting (`web/src/lib/ratelimit.ts`) on
  signup/login/reset/verification and playlist submission; a correct login
  clears its buckets.
- API access for the extension: `Authorization: Bearer <api_token>` resolved by
  `getRequestUser(req)` (bearer OR session cookie); CORS-open on the token-auth
  job/upload routes (safe because they use bearer, not cookies).

---

## 10. Environment & running

- `.env.example` documents every var. Key ones: `DATABASE_URL`, `STORAGE_DRIVER`
  (+ `UPLOAD_DIR` or `S3_*`), `APP_URL`, `STRIPE_*`/`DEV_FAKE_CHECKOUT`,
  `RESEND_API_KEY`/`EMAIL_FROM`, `ADMIN_EMAILS` (who sees `/developer`),
  `GROQ_API_KEY`/`SONIOX_API_KEY`, `TRANSCRIBE_BACKEND`,
  `AUDIO_RETENTION_DAYS`, and `SSRF_ALLOW_PRIVATE`. The public web
  process never runs yt-dlp; URL inspection happens in the isolated worker.
- **Run:** `make setup` then `make dev` (starts Postgres, web on :3000, worker).
  `make migrate`, `make stop`, `make logs`, `make status`. Or `docker-compose up`
  for Postgres and run web/worker directly.
- Web: `cd web && npm run dev`. Worker: `cd worker && .venv/bin/python -m
  worker.main`.

---

## 11. Conventions

- **Branch:** develop on `claude/adoring-newton-5fchl4`; push with
  `git push -u origin claude/adoring-newton-5fchl4`. Don't open PRs unless asked.
- **Commits:** clear messages; end with the trailers
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: <url>`.
- **Verify each increment:** `npx tsc --noEmit` + `npm run build` in `web/`;
  apply new migrations; extend the Playwright E2E in `scratchpad/e2e/` and the
  worker Python tests; then commit + push.
- **Kill dev servers when done** — leaving `next dev` / the worker running
  overnight burns compute.

---

## 12. Known constraints / gotchas

- **URL pricing confirmation** is asynchronous: the worker inspects the source,
  then the job page asks the customer to approve duration and the exact
  allowance/backup-credit split before transcription begins.
- **Browser-recorded WebM has no container duration** (live stream); the worker
  probes by decoding as a fallback. Keep that fallback.
- **`UPLOAD_DIR` must resolve identically for web and worker** — it's anchored to
  the repo root; a *relative* value like `./data/uploads` still works because
  both anchor to the repo root, not cwd.
- **Safari extension** must be packaged with `xcrun safari-web-extension-
  converter` (macOS + Xcode). The MV3 source targets Chrome/Edge/Firefox
  directly; Safari packaging can't be done on Linux/CI here.
- **Dev-sandbox note (this environment only):** Postgres is periodically reaped;
  restart it if the app/worker suddenly can't connect on 5432.

---

## 13. Where to look first for a given task

- Add/adjust a customer string → `web/src/lib/content.ts` (+ the `<T>`/`useContent`
  usage in the relevant component).
- Pricing/limits/config → `web/src/lib/settings.ts` + `/developer/settings`.
- Job creation/validation → `web/src/app/api/jobs/route.ts`.
- Transcription behavior/providers → `worker/worker/pipeline.py`,
  `routing.py`, `providers/`.
- Billing math → `pricing.ts` (web) + `worker/worker/db.py` (`place_hold`,
  `complete_job`).
- Schema change → edit `schema.ts`, add `drizzle/NNNN_*.sql` + journal entry,
  `make migrate`.
