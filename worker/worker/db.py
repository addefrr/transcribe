import logging
import math
import time
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from . import config
from .errors import InsufficientCredits

log = logging.getLogger(__name__)


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
        row = conn.execute(
            """
            UPDATE jobs SET status = 'probing', claimed_at = now(), updated_at = now()
            WHERE id = (
              SELECT id FROM jobs WHERE status = 'pending'
              ORDER BY created_at
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            RETURNING *
            """
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
    video_id: str,
    tier: str,
    diarize: bool,
    language_hint: Optional[str],
) -> Optional[dict[str, Any]]:
    """Most recent completed transcript for the same platform video produced with
    the same tier / speaker-labels / language, or None. Cross-user by design —
    the content is a public platform video."""
    row = conn.execute(
        """
        SELECT t.text, t.segments, j.duration_seconds, j.language, j.audio_key
        FROM jobs j JOIN transcripts t ON t.job_id = j.id
        WHERE j.source_video_id = %s
          AND j.tier = %s
          AND j.diarize = %s
          AND j.status = 'completed'
          AND j.duration_seconds IS NOT NULL
          AND (%s::text IS NULL AND j.language_hint IS NULL
               OR j.language_hint = %s)
        ORDER BY j.created_at DESC
        LIMIT 1
        """,
        (video_id, tier, diarize, language_hint, language_hint),
    ).fetchone()
    return row


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
    """Estimated transcription API cost, for the platform spend wallet."""
    minutes = max(1, math.ceil(duration_seconds / 60))
    return minutes * float(job.get("cost_per_minute_cents") or 0)


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
) -> None:
    """Store the transcript, charge for actual duration (capped at the hold),
    refund the rest — one transaction, idempotent per job."""
    with conn.transaction():
        row = conn.execute(
            "SELECT credits_held, credits_charged, status FROM jobs WHERE id = %s FOR UPDATE",
            (job["id"],),
        ).fetchone()
        if row["status"] == "completed":
            return
        held = row["credits_held"]
        charge = min(credits_for(actual_duration, job["credits_per_minute"]), held)
        _refund(conn, job, held - charge)
        conn.execute(
            """
            INSERT INTO transcripts (job_id, text, segments)
            VALUES (%s, %s, %s)
            ON CONFLICT (job_id) DO UPDATE SET text = EXCLUDED.text, segments = EXCLUDED.segments
            """,
            (job["id"], text, Jsonb(segments)),
        )
        conn.execute(
            """
            UPDATE jobs SET status = 'completed', credits_charged = %s, duration_seconds = %s,
                            language = %s, est_cost_cents = %s, error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (charge, actual_duration, language, est_cost_cents(actual_duration, job), job["id"]),
        )


def complete_job_subscription(
    conn: psycopg.Connection,
    job: dict[str, Any],
    actual_duration: float,
    text: str,
    segments: list[dict[str, Any]],
    language: Optional[str],
) -> None:
    """Store the transcript and draw the audio minutes from the subscription's
    allowance instead of charging credits. Idempotent per job."""
    minutes = max(1, math.ceil(actual_duration / 60))
    with conn.transaction():
        row = conn.execute(
            "SELECT status, subscription_id FROM jobs WHERE id = %s FOR UPDATE",
            (job["id"],),
        ).fetchone()
        if row["status"] == "completed":
            return
        if row["subscription_id"]:
            conn.execute(
                "UPDATE subscriptions SET minutes_used = minutes_used + %s WHERE id = %s",
                (minutes, row["subscription_id"]),
            )
        conn.execute(
            """
            INSERT INTO transcripts (job_id, text, segments)
            VALUES (%s, %s, %s)
            ON CONFLICT (job_id) DO UPDATE SET text = EXCLUDED.text, segments = EXCLUDED.segments
            """,
            (job["id"], text, Jsonb(segments)),
        )
        conn.execute(
            """
            UPDATE jobs SET status = 'completed', credits_charged = 0, duration_seconds = %s,
                            language = %s, est_cost_cents = %s, error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (actual_duration, language, est_cost_cents(actual_duration, job), job["id"]),
        )


def fail_job(conn: psycopg.Connection, job: dict[str, Any], error: str) -> None:
    """Mark failed and release the full hold, if one was placed."""
    with conn.transaction():
        row = conn.execute(
            "SELECT credits_held, credits_charged, status FROM jobs WHERE id = %s FOR UPDATE",
            (job["id"],),
        ).fetchone()
        if row is None or row["status"] in ("completed", "failed"):
            return
        _refund(conn, job, row["credits_held"] - row["credits_charged"])
        conn.execute(
            "UPDATE jobs SET status = 'failed', credits_held = 0, error = %s, updated_at = now() WHERE id = %s",
            (error[:2000], job["id"]),
        )
