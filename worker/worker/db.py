import logging
import math
import time
from calendar import monthrange
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from . import config
from .errors import InsufficientCredits, ProviderBudgetExceeded

log = logging.getLogger(__name__)

# Must match web/src/lib/spend-budget.ts. Every new/increased provider-spend
# reservation holds this transaction-scoped PostgreSQL advisory lock until its
# jobs.est_cost_cents write commits.
_SPEND_LOCK_NAMESPACE = 8_367_441
_SPEND_LOCK_KEY = 1
_DEFAULT_WALLET_SPEND_PCT = 80.0


def connect() -> psycopg.Connection:
    delay = 1.0
    while True:
        try:
            conn = psycopg.connect(config.DATABASE_URL, row_factory=dict_row, autocommit=True)
            return conn
        except psycopg.OperationalError as exc:
            log.warning("database not reachable (%s); retrying in %.0fs", exc, delay)
            time.sleep(delay)
            delay = min(delay * 2, 30)


def claim_job(conn: psycopg.Connection) -> Optional[dict[str, Any]]:
    with conn.transaction():
        candidate = conn.execute(
            """
            SELECT j.id, j.user_id
            FROM jobs j
            WHERE j.status = 'pending'
              AND (
                SELECT count(*) FROM jobs active
                WHERE active.user_id = j.user_id
                  AND active.status IN ('probing', 'downloading', 'transcribing')
            ) < %s
            ORDER BY j.created_at
            LIMIT 1
            """,
            (config.MAX_ACTIVE_JOBS_PER_USER,),
        ).fetchone()
        if candidate is None:
            return None

        # Serialize the final per-account recheck. Lock the account before the
        # candidate job so account-level cancellation and web submissions use
        # the same lock order and cannot deadlock this claim.
        # Without the user-row lock,
        # several workers can each observe the same free slot and claim a
        # different queued playlist item at once.
        account = conn.execute(
            "SELECT id FROM users WHERE id = %s FOR UPDATE",
            (candidate["user_id"],),
        ).fetchone()
        if account is None:
            return None
        locked_candidate = conn.execute(
            """
            SELECT id FROM jobs
            WHERE id = %s AND status = 'pending'
            FOR UPDATE SKIP LOCKED
            """,
            (candidate["id"],),
        ).fetchone()
        if locked_candidate is None:
            return None
        active = conn.execute(
            """
            SELECT count(*) AS count FROM jobs
            WHERE user_id = %s
              AND status IN ('probing', 'downloading', 'transcribing')
            """,
            (candidate["user_id"],),
        ).fetchone()["count"]
        if active >= config.MAX_ACTIVE_JOBS_PER_USER:
            return None

        row = conn.execute(
            """
            UPDATE jobs
            SET status = 'probing', claimed_at = now(), updated_at = now()
            WHERE id = %s AND status = 'pending'
            RETURNING *
            """,
            (candidate["id"],),
        ).fetchone()
    return row


def requeue_stale(conn: psycopg.Connection) -> int:
    """Put jobs abandoned by a dead worker back in the queue.

    Re-processing is safe: hold placement and settlement both check the
    job row first, so credits are never held or charged twice.
    """
    with conn.transaction():
        rows = conn.execute(
            """
            UPDATE jobs SET status = 'pending', claimed_at = NULL, updated_at = now()
            WHERE status IN ('probing', 'downloading', 'transcribing')
              AND claimed_at < now() - make_interval(mins => %s)
            RETURNING id
            """,
            (config.STALE_JOB_MINUTES,),
        ).fetchall()
    for row in rows:
        log.warning("requeued stale job %s", row["id"])
    return len(rows)


def set_status(conn: psycopg.Connection, job_id: str, status: str) -> None:
    conn.execute(
        "UPDATE jobs SET status = %s, updated_at = now() WHERE id = %s", (status, job_id)
    )


def set_output_name(conn: psycopg.Connection, job_id: str, name: str) -> None:
    conn.execute(
        "UPDATE jobs SET output_name = %s, updated_at = now() WHERE id = %s",
        (name[:300], job_id),
    )


def upload_expected_size(
    conn: psycopg.Connection, key: str, user_id: str
) -> Optional[int]:
    """Return the server-recorded upload size for this account/job.

    The web process validates the object before claiming it, and the worker
    validates it again immediately before download. This closes the interval in
    which a still-valid presigned PUT URL could otherwise replace the object.
    """
    row = conn.execute(
        """
        SELECT size_bytes FROM uploads
        WHERE key = %s AND user_id = %s AND claimed_at IS NOT NULL
        LIMIT 1
        """,
        (key, user_id),
    ).fetchone()
    return int(row["size_bytes"]) if row else None


def set_source_video_id(conn: psycopg.Connection, job_id: str, video_id: str) -> None:
    conn.execute(
        "UPDATE jobs SET source_video_id = %s, updated_at = now() WHERE id = %s",
        (video_id[:300], job_id),
    )


# Small TTL cache so we don't hit the settings table on every job.
_settings_cache: dict[str, tuple[float, Any]] = {}


def get_setting(conn: psycopg.Connection, key: str, default: Any) -> Any:
    """Read a value from the web app's `settings` table (jsonb), cached ~5s so a
    dev toggle applies quickly without a query per job. Falls back to `default`."""
    hit = _settings_cache.get(key)
    if hit and time.monotonic() - hit[0] < 5.0:
        return hit[1]
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = %s", (key,)).fetchone()
        value = row["value"] if row is not None else default
    except Exception:
        value = default
    _settings_cache[key] = (time.monotonic(), value)
    return value


def find_reusable_transcript(
    conn: psycopg.Connection,
    user_id: str,
    video_id: str,
    tier: str,
    diarize: bool,
    language_hint: Optional[str],
) -> Optional[dict[str, Any]]:
    """Most recent completed transcript for this account and platform video.

    Reuse is intentionally account-scoped: an unlisted URL is not necessarily
    public, and a cross-account cache would leak both existence and corrections.
    """
    row = conn.execute(
        """
        SELECT t.text, t.segments, j.duration_seconds, j.language, j.audio_key,
               j.provider, j.model
        FROM jobs j JOIN transcripts t ON t.job_id = j.id
        WHERE j.user_id = %s
          AND j.source_video_id = %s
          AND j.tier = %s
          AND j.diarize = %s
          AND j.status = 'completed'
          AND j.duration_seconds IS NOT NULL
          AND (%s::text IS NULL AND j.language_hint IS NULL
               OR j.language_hint = %s)
        ORDER BY j.created_at DESC
        LIMIT 1
        """,
        (user_id, video_id, tier, diarize, language_hint, language_hint),
    ).fetchone()
    return row


def set_awaiting_confirmation(
    conn: psycopg.Connection,
    job_id: str,
    duration_seconds: float,
) -> None:
    """Finish a URL safety/price probe without starting paid ASR work."""
    conn.execute(
        """
        UPDATE jobs
        SET status = 'awaiting_confirmation', duration_seconds = %s,
            claimed_at = NULL, updated_at = now()
        WHERE id = %s
        """,
        (duration_seconds, job_id),
    )


def mark_provider_call_started(
    conn: psycopg.Connection, job_id: str, provider: str, model: str
) -> None:
    """Persist the point-of-no-return immediately before remote ASR.

    A later failure keeps the spend reservation once this marker exists,
    because the provider may already have accepted or billed the request.
    """
    conn.execute(
        """
        UPDATE jobs
        SET status = 'transcribing', provider = %s, model = %s,
            provider_started_at = coalesce(provider_started_at, now()),
            updated_at = now()
        WHERE id = %s
        """,
        (provider, model, job_id),
    )


def set_reuse_info(
    conn: psycopg.Connection,
    job_id: str,
    provider: Optional[str],
    model: Optional[str],
) -> None:
    conn.execute(
        """
        UPDATE jobs
        SET provider = %s, model = %s, result_source = 'same-account-cache',
            updated_at = now()
        WHERE id = %s
        """,
        (provider, model, job_id),
    )


def set_audio(conn: psycopg.Connection, job_id: str, key: str, retention_days: int) -> None:
    conn.execute(
        "UPDATE jobs SET audio_key = %s, audio_expires_at = now() + make_interval(days => %s) "
        "WHERE id = %s",
        (key, retention_days, job_id),
    )


def claim_batch(conn: psycopg.Connection) -> Optional[dict[str, Any]]:
    """Claim an unexpanded (or stale) playlist batch for expansion."""
    with conn.transaction():
        row = conn.execute(
            """
            UPDATE job_batches SET claimed_at = now(), updated_at = now()
            WHERE id = (
              SELECT id FROM job_batches
              WHERE status = 'expanding'
                AND (claimed_at IS NULL OR claimed_at < now() - make_interval(mins => %s))
              ORDER BY created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            RETURNING *
            """,
            (config.STALE_JOB_MINUTES,),
        ).fetchone()
    return row


def set_batch_ready(
    conn: psycopg.Connection, batch_id: str, items: list[dict[str, Any]], total_seconds: float
) -> None:
    conn.execute(
        "UPDATE job_batches SET status = 'ready', items = %s, video_count = %s, "
        "total_seconds = %s, updated_at = now() WHERE id = %s",
        (Jsonb(items), len(items), total_seconds, batch_id),
    )


def fail_batch(conn: psycopg.Connection, batch_id: str, error: str) -> None:
    conn.execute(
        "UPDATE job_batches SET status = 'failed', error = %s, updated_at = now() WHERE id = %s",
        (error[:2000], batch_id),
    )


def credits_for(duration_seconds: float, credits_per_minute: int) -> int:
    return max(1, math.ceil(duration_seconds / 60)) * credits_per_minute


def est_cost_cents(duration_seconds: float, job: dict[str, Any]) -> float:
    """Conservative whole-audio-minute API cost for the spend wallet."""
    minutes = max(1, math.ceil(duration_seconds / 60))
    return minutes * float(job.get("cost_per_minute_cents") or 0)


def _spend_fits_budget(
    revenue_cents: float,
    committed_cents: float,
    current_job_cents: float,
    projected_job_cents: float,
    spend_pct: float,
) -> bool:
    """Pure budget predicate used by reservation code and focused tests."""
    if revenue_cents <= 0:
        # Preserve verified-user signup-bonus usage before the first payment.
        return True
    budget = revenue_cents * min(100.0, max(1.0, spend_pct)) / 100.0
    projected_total = max(
        0.0,
        committed_cents - current_job_cents + projected_job_cents,
    )
    return projected_total <= budget + 1e-9


def reserve_provider_spend(
    conn: psycopg.Connection,
    job: dict[str, Any],
    duration_seconds: float,
) -> float:
    """Reserve projected provider spend before any remote ASR call.

    ``jobs.est_cost_cents`` is both the per-job reservation and the value summed
    by the global wallet. The job row prevents a retry from reserving twice; the
    shared advisory lock makes the sum/check/write atomic across every worker
    and web confirmation. If normalization crosses another whole-minute
    boundary, only the increase is checked and reserved.
    """
    projected = max(0.0, est_cost_cents(duration_seconds, job))
    with conn.transaction():
        current_row = conn.execute(
            "SELECT est_cost_cents FROM jobs WHERE id = %s FOR UPDATE",
            (job["id"],),
        ).fetchone()
        if current_row is None:
            raise ProviderBudgetExceeded()
        current = max(0.0, float(current_row["est_cost_cents"] or 0))

        # Never reduce a committed attempt implicitly. Same-account cache reuse
        # is the one proven-zero-cost path and explicitly settles to zero.
        if projected <= current:
            return current

        conn.execute(
            "SELECT pg_advisory_xact_lock(%s, %s)",
            (_SPEND_LOCK_NAMESPACE, _SPEND_LOCK_KEY),
        )
        wallet = conn.execute(
            """
            SELECT
              ((SELECT coalesce(sum(amount_usd_cents), 0) FROM credit_ledger
                  WHERE reason IN ('purchase', 'subscription'))
               + (SELECT coalesce(sum(value), 0) FROM platform_metrics
                  WHERE "key" IN (
                    'credit_revenue_cents', 'subscription_revenue_cents'
                  ))) AS revenue_cents,
              ((SELECT coalesce(sum(est_cost_cents), 0) FROM jobs)
               + coalesce((SELECT value FROM platform_metrics
                  WHERE "key" = 'provider_spend_cents'), 0)) AS committed_cents,
              least(100, greatest(1, coalesce(
                (SELECT CASE
                   WHEN jsonb_typeof(value) = 'number'
                     THEN (value #>> '{}')::double precision
                   ELSE NULL
                 END
                 FROM settings
                 WHERE key = 'walletSpendPct'),
                %s
              ))) AS spend_pct
            """,
            (_DEFAULT_WALLET_SPEND_PCT,),
        ).fetchone()
        if not _spend_fits_budget(
            float(wallet["revenue_cents"] or 0),
            float(wallet["committed_cents"] or 0),
            current,
            projected,
            float(wallet["spend_pct"] or _DEFAULT_WALLET_SPEND_PCT),
        ):
            raise ProviderBudgetExceeded()

        conn.execute(
            "UPDATE jobs SET est_cost_cents = %s, updated_at = now() WHERE id = %s",
            (projected, job["id"]),
        )
    return projected


def _next_month(value: datetime) -> datetime:
    """Advance one calendar month while keeping a valid day-of-month."""
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _advance_monthly_window(start: datetime, end: datetime, now: datetime) -> tuple[datetime, datetime]:
    """Return the monthly allowance window containing ``now``."""
    while now >= end:
        start = end
        end = _next_month(end)
    return start, end


def place_hold(conn: psycopg.Connection, job: dict[str, Any], duration_seconds: float) -> int:
    """Reserve credits for the probed duration. Idempotent per job."""
    credits = credits_for(duration_seconds, job["credits_per_minute"])
    with conn.transaction():
        already = conn.execute(
            "SELECT credits_held FROM jobs WHERE id = %s FOR UPDATE", (job["id"],)
        ).fetchone()["credits_held"]
        if already > 0:
            return already
        balance = conn.execute(
            "SELECT credit_balance FROM users WHERE id = %s FOR UPDATE", (job["user_id"],)
        ).fetchone()["credit_balance"]
        if balance < credits:
            raise InsufficientCredits(needed=credits, balance=balance)
        conn.execute(
            "UPDATE users SET credit_balance = credit_balance - %s WHERE id = %s",
            (credits, job["user_id"]),
        )
        conn.execute(
            "INSERT INTO credit_ledger (user_id, delta, reason, job_id) VALUES (%s, %s, 'hold', %s)",
            (job["user_id"], -credits, job["id"]),
        )
        conn.execute(
            "UPDATE jobs SET credits_held = %s, duration_seconds = %s, updated_at = now() WHERE id = %s",
            (credits, duration_seconds, job["id"]),
        )
    return credits


def place_subscription_hold(
    conn: psycopg.Connection,
    job: dict[str, Any],
    duration_seconds: float,
) -> tuple[int, int]:
    """Atomically reserve plan minutes and backup credits for a job.

    The plan covers as many whole audio minutes as remain. If the clip crosses
    the allowance boundary, only the remainder is reserved from backup credits.
    Locking the subscription and user rows prevents concurrent jobs from all
    spending the same remaining allowance.
    """
    needed_minutes = max(1, math.ceil(duration_seconds / 60))
    with conn.transaction():
        current = conn.execute(
            """
            SELECT subscription_id, subscription_minutes_held, credits_held,
                   subscription_allowance_period_end
            FROM jobs WHERE id = %s FOR UPDATE
            """,
            (job["id"],),
        ).fetchone()
        if current["subscription_minutes_held"] > 0 or current["credits_held"] > 0:
            return current["subscription_minutes_held"], current["credits_held"]

        # Use the same account -> subscription lock order as the web app's
        # confirmation, batch, and deletion transactions.
        user = conn.execute(
            "SELECT credit_balance FROM users WHERE id = %s FOR UPDATE",
            (job["user_id"],),
        ).fetchone()
        balance = user["credit_balance"] if user else 0

        plan_minutes = 0
        subscription_id = current["subscription_id"]
        if subscription_id:
            sub = conn.execute(
                """
                SELECT status, interval, allowance_minutes, minutes_used,
                       period_end, allowance_period_start, allowance_period_end
                FROM subscriptions WHERE id = %s FOR UPDATE
                """,
                (subscription_id,),
            ).fetchone()
            now = datetime.now(timezone.utc)
            if (
                sub is not None
                and sub["status"] == "active"
                and sub["period_end"] >= now
            ):
                # An annual subscription has a year-long billing period but a
                # monthly entitlement. An upload can sit in the queue across a
                # reset boundary, so roll the locked row here before reserving
                # it. Old-window job refunds are guarded by their snapshotted
                # allowance end and therefore cannot reduce this new window.
                if sub["interval"] != "week" and now >= sub["allowance_period_end"]:
                    window_start, window_end = _advance_monthly_window(
                        sub["allowance_period_start"],
                        sub["allowance_period_end"],
                        now,
                    )
                    conn.execute(
                        """
                        UPDATE subscriptions
                        SET minutes_used = 0, allowance_period_start = %s,
                            allowance_period_end = %s
                        WHERE id = %s
                        """,
                        (window_start, window_end, subscription_id),
                    )
                    sub["minutes_used"] = 0
                    sub["allowance_period_start"] = window_start
                    sub["allowance_period_end"] = window_end
                available = max(0, sub["allowance_minutes"] - sub["minutes_used"])
                plan_minutes = min(needed_minutes, available)

        backup_minutes = needed_minutes - plan_minutes
        backup_credits = backup_minutes * int(job["credits_per_minute"])
        if backup_credits and balance < backup_credits:
            raise InsufficientCredits(needed=backup_credits, balance=balance)

        if plan_minutes and subscription_id:
            conn.execute(
                "UPDATE subscriptions SET minutes_used = minutes_used + %s WHERE id = %s",
                (plan_minutes, subscription_id),
            )
        if backup_credits:
            conn.execute(
                "UPDATE users SET credit_balance = credit_balance - %s WHERE id = %s",
                (backup_credits, job["user_id"]),
            )
            conn.execute(
                """
                INSERT INTO credit_ledger (user_id, delta, reason, job_id)
                VALUES (%s, %s, 'hold', %s)
                """,
                (job["user_id"], -backup_credits, job["id"]),
            )
        conn.execute(
            """
            UPDATE jobs
            SET subscription_minutes_held = %s, credits_held = %s,
                subscription_allowance_period_end = %s,
                duration_seconds = %s, updated_at = now()
            WHERE id = %s
            """,
            (
                plan_minutes,
                backup_credits,
                sub["allowance_period_end"] if plan_minutes else None,
                duration_seconds,
                job["id"],
            ),
        )
    return plan_minutes, backup_credits


def _refund(conn: psycopg.Connection, job: dict[str, Any], amount: int) -> None:
    if amount <= 0:
        return
    conn.execute(
        "UPDATE users SET credit_balance = credit_balance + %s WHERE id = %s",
        (amount, job["user_id"]),
    )
    conn.execute(
        "INSERT INTO credit_ledger (user_id, delta, reason, job_id) VALUES (%s, %s, 'refund', %s)",
        (job["user_id"], amount, job["id"]),
    )


def complete_job(
    conn: psycopg.Connection,
    job: dict[str, Any],
    actual_duration: float,
    text: str,
    segments: list[dict[str, Any]],
    language: Optional[str],
    cost_cents: Optional[float] = None,
) -> None:
    """Store the transcript, charge for actual duration (capped at the hold),
    refund the rest — one transaction, idempotent per job. `cost_cents` overrides
    the estimated API cost recorded for the spend wallet (0 for reused
    transcripts, which cost us nothing)."""
    with conn.transaction():
        row = conn.execute(
            """
            SELECT credits_held, credits_charged, est_cost_cents, status
            FROM jobs WHERE id = %s FOR UPDATE
            """,
            (job["id"],),
        ).fetchone()
        if row["status"] == "completed":
            return
        held = row["credits_held"]
        charge = min(credits_for(actual_duration, job["credits_per_minute"]), held)
        _refund(conn, job, held - charge)
        cost = (
            max(float(row["est_cost_cents"] or 0), est_cost_cents(actual_duration, job))
            if cost_cents is None
            else max(0.0, cost_cents)
        )
        conn.execute(
            """
            INSERT INTO transcripts (job_id, text, segments)
            VALUES (%s, %s, %s)
            ON CONFLICT (job_id) DO UPDATE SET text = EXCLUDED.text,
                segments = EXCLUDED.segments, updated_at = now()
            """,
            (job["id"], text, Jsonb(segments)),
        )
        conn.execute(
            """
            UPDATE jobs SET status = 'completed', credits_charged = %s, duration_seconds = %s,
                            language = %s, est_cost_cents = %s,
                            result_source = coalesce(result_source, 'provider'),
                            error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (charge, actual_duration, language, cost, job["id"]),
        )


def complete_job_subscription(
    conn: psycopg.Connection,
    job: dict[str, Any],
    actual_duration: float,
    text: str,
    segments: list[dict[str, Any]],
    language: Optional[str],
    cost_cents: Optional[float] = None,
) -> None:
    """Store the transcript and draw the audio minutes from the subscription's
    allowance instead of charging credits. Idempotent per job. `cost_cents`
    overrides the estimated API cost recorded for the spend wallet (0 for reused
    transcripts, which cost us nothing)."""
    minutes = max(1, math.ceil(actual_duration / 60))
    with conn.transaction():
        row = conn.execute(
            """
            SELECT status, subscription_id, subscription_minutes_held,
                   subscription_minutes_charged, subscription_allowance_period_end,
                   credits_held, credits_charged, est_cost_cents
            FROM jobs WHERE id = %s FOR UPDATE
            """,
            (job["id"],),
        ).fetchone()
        if row["status"] == "completed":
            return
        plan_charge = min(minutes, row["subscription_minutes_held"])
        plan_refund = row["subscription_minutes_held"] - plan_charge
        backup_minutes = max(0, minutes - plan_charge)
        credit_charge = min(
            backup_minutes * int(job["credits_per_minute"]),
            row["credits_held"],
        )
        if row["subscription_id"] and plan_refund:
            conn.execute(
                """
                UPDATE subscriptions
                SET minutes_used = greatest(0, minutes_used - %s)
                WHERE id = %s
                  AND allowance_period_end = coalesce(%s, allowance_period_end)
                """,
                (
                    plan_refund,
                    row["subscription_id"],
                    row["subscription_allowance_period_end"],
                ),
            )
        _refund(conn, job, row["credits_held"] - credit_charge)
        cost = (
            max(float(row["est_cost_cents"] or 0), est_cost_cents(actual_duration, job))
            if cost_cents is None
            else max(0.0, cost_cents)
        )
        conn.execute(
            """
            INSERT INTO transcripts (job_id, text, segments)
            VALUES (%s, %s, %s)
            ON CONFLICT (job_id) DO UPDATE SET text = EXCLUDED.text,
                segments = EXCLUDED.segments, updated_at = now()
            """,
            (job["id"], text, Jsonb(segments)),
        )
        conn.execute(
            """
            UPDATE jobs SET status = 'completed', credits_charged = %s,
                            subscription_minutes_charged = %s, duration_seconds = %s,
                            language = %s, est_cost_cents = %s,
                            result_source = coalesce(result_source, 'provider'),
                            error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (credit_charge, plan_charge, actual_duration, language, cost, job["id"]),
        )


def fail_job(conn: psycopg.Connection, job: dict[str, Any], error: str) -> None:
    """Mark failed and release the full hold, if one was placed."""
    with conn.transaction():
        row = conn.execute(
            """
            SELECT credits_held, credits_charged, status, subscription_id,
                   subscription_minutes_held, subscription_minutes_charged,
                   subscription_allowance_period_end, est_cost_cents,
                   provider_started_at
            FROM jobs WHERE id = %s FOR UPDATE
            """,
            (job["id"],),
        ).fetchone()
        if row is None or row["status"] in ("completed", "failed"):
            return
        _refund(conn, job, row["credits_held"] - row["credits_charged"])
        plan_refund = row["subscription_minutes_held"] - row["subscription_minutes_charged"]
        if row["subscription_id"] and plan_refund > 0:
            conn.execute(
                """
                UPDATE subscriptions
                SET minutes_used = greatest(0, minutes_used - %s)
                WHERE id = %s
                  AND allowance_period_end = coalesce(%s, allowance_period_end)
                """,
                (
                    plan_refund,
                    row["subscription_id"],
                    row["subscription_allowance_period_end"],
                ),
            )
        # Before the provider marker, no paid request was attempted and the
        # reservation can be released. After it, retain the conservative amount
        # because a timeout/crash cannot prove the provider did no work.
        retained_cost = (
            float(row["est_cost_cents"] or 0)
            if row["provider_started_at"] is not None
            else 0.0
        )
        conn.execute(
            """
            UPDATE jobs SET status = 'failed', credits_held = 0,
                subscription_minutes_held = 0, est_cost_cents = %s,
                error = %s, updated_at = now()
            WHERE id = %s
            """,
            (retained_cost, error[:2000], job["id"]),
        )
