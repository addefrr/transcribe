import logging
import shutil
import tempfile
import threading
from typing import Any

import psycopg

from . import config, db, media, providers, routing, ssrf, storage
from .errors import JobError

log = logging.getLogger(__name__)

_HEARTBEAT_SECONDS = 60


class _Heartbeat:
    """Refresh claimed_at while a job runs so requeue_stale doesn't hand a
    still-in-progress job to another worker. Uses its own connection — the
    main connection is busy and psycopg connections aren't thread-safe."""

    def __init__(self, job_id: str):
        self._job_id = job_id
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self) -> "_Heartbeat":
        self._thread.start()
        return self

    def __exit__(self, *exc_info) -> None:
        self._stop.set()
        self._thread.join(timeout=5)

    def _run(self) -> None:
        try:
            conn = psycopg.connect(config.DATABASE_URL, autocommit=True)
        except Exception:
            log.warning("heartbeat for job %s could not connect", self._job_id)
            return
        try:
            while not self._stop.wait(_HEARTBEAT_SECONDS):
                conn.execute(
                    "UPDATE jobs SET claimed_at = now() WHERE id = %s", (self._job_id,)
                )
        except Exception:
            log.warning("heartbeat for job %s stopped", self._job_id, exc_info=True)
        finally:
            conn.close()


def process_job(conn: psycopg.Connection, job: dict[str, Any]) -> None:
    workdir = tempfile.mkdtemp(prefix=f"job-{job['id']}-")
    try:
        with _Heartbeat(job["id"]):
            _run(conn, job, workdir)
        _cleanup_source(conn, job)
    except JobError as exc:
        log.warning("job %s failed: %s", job["id"], exc)
        db.fail_job(conn, job, str(exc))
        _cleanup_source(conn, job)
    except Exception:
        log.exception("job %s crashed", job["id"])
        db.fail_job(conn, job, "Internal error while processing this job.")
        _cleanup_source(conn, job)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _cleanup_source(conn: psycopg.Connection, job: dict[str, Any]) -> None:
    """Delete the uploaded source once the job is terminal. Deliberately not
    reached when fail_job itself raised — a requeued job still needs the file."""
    if job["source_type"] == "upload" and job["upload_key"]:
        if storage.delete_key(job["upload_key"]):
            # Upload-intent rows are lifecycle metadata, not a permanent history.
            conn.execute("DELETE FROM uploads WHERE key = %s", (job["upload_key"],))
        else:
            # Turn a claimed upload into an expired cleanup candidate. Keeping
            # its row is what makes a transient object-store failure retryable.
            conn.execute(
                "UPDATE uploads SET claimed_at = NULL, expires_at = now() WHERE key = %s",
                (job["upload_key"],),
            )


def _reuse(
    conn: psycopg.Connection,
    job: dict[str, Any],
    video_id: str,
    cached: dict[str, Any],
    on_subscription: bool,
) -> None:
    """Complete a job by copying an existing transcript for the same video."""
    duration = float(cached["duration_seconds"])
    # Give the reused job its own playback audio if the source's is still around.
    if config.AUDIO_RETENTION_DAYS > 0 and cached.get("audio_key"):
        try:
            key = f"audio/{job['id']}.ogg"
            if storage.copy_key(cached["audio_key"], key):
                db.set_audio(conn, job["id"], key, config.AUDIO_RETENTION_DAYS)
        except Exception:
            log.warning("could not copy reused audio for job %s", job["id"], exc_info=True)
    db.set_reuse_info(conn, job["id"], cached.get("provider"), cached.get("model"))
    db.set_status(conn, job["id"], "transcribing")
    # Reuse copies an existing transcript, so we pay no transcription API cost —
    # record 0 so the spend wallet and contribution figures aren't inflated.
    if on_subscription:
        db.complete_job_subscription(
            conn, job, duration, cached["text"], cached["segments"], cached.get("language"),
            cost_cents=0.0,
        )
    else:
        db.complete_job(
            conn, job, duration, cached["text"], cached["segments"], cached.get("language"),
            cost_cents=0.0,
        )
    log.info("job %s reused transcript for %s (%.0fs)", job["id"], video_id, duration)


def _check_duration(duration: float) -> None:
    if duration > config.MAX_DURATION_SECONDS:
        raise JobError(
            f"Media is {duration / 3600:.1f}h long; the maximum is "
            f"{config.MAX_DURATION_SECONDS / 3600:.1f}h."
        )


def _run(conn: psycopg.Connection, job: dict[str, Any], workdir: str) -> None:
    if job.get("provider_started_at") is not None:
        # A stale paid request is not safe to replay automatically: the remote
        # provider may have completed/billed it even if this worker never stored
        # the response. fail_job refunds the customer's hold but deliberately
        # retains the conservative provider-spend reservation.
        raise JobError(
            "A previous provider request was interrupted and was not retried "
            "automatically to avoid a possible duplicate charge."
        )

    tier = job["tier"]
    language_hint = job.get("language_hint") or None
    backend, model_name = routing.resolve(tier, language_hint)
    if backend is None:
        raise JobError(f"Unknown quality tier {tier!r}.")

    # Subscription-billed jobs draw on a minute allowance instead of credits, so
    # they skip credit holds entirely and settle against the subscription.
    on_subscription = job.get("billing") == "subscription"

    # 1. Probe duration (cheap, no full download) and reserve credits.
    #    Direct file URLs expose no duration metadata, so for those the hold
    #    happens right after the (size-capped) download instead.
    src = None
    video_id = None
    if job["source_type"] == "url":
        ssrf.check_url(job["source_url"])
        est_duration, title, video_id = media.probe_url(job["source_url"])
        # Give URL jobs a human-friendly name (video title) for display/downloads.
        if title and not job.get("output_name"):
            db.set_output_name(conn, job["id"], title)
        if video_id:
            db.set_source_video_id(conn, job["id"], video_id)
        # New URL submissions are first inspected by the isolated worker. This
        # gives the customer an authoritative duration and cost before any paid
        # ASR call, and keeps yt-dlp off the public web process.
        if job.get("requires_confirmation") and not job.get("confirmed_at"):
            if est_duration is None:
                src = media.download_url(job["source_url"], workdir)
                est_duration = media.probe_file(src)
            _check_duration(est_duration)
            db.set_awaiting_confirmation(conn, job["id"], est_duration)
            return
    else:
        expected_size = db.upload_expected_size(conn, job["upload_key"], job["user_id"])
        if expected_size is None:
            raise JobError("The upload authorization is missing or expired.")
        src = storage.fetch_upload(job["upload_key"], workdir, expected_size)
        est_duration = media.probe_file(src)

    if est_duration is not None:
        _check_duration(est_duration)
        # Reserve provider spend before any remote ASR call. On a pre-provider
        # failure, fail_job releases this reservation together with user holds.
        db.reserve_provider_spend(conn, job, est_duration)
        if on_subscription:
            plan_held, backup_held = db.place_subscription_hold(conn, job, est_duration)
            log.info(
                "job %s: %.0fs, %d plan minutes and %d backup credits held",
                job["id"], est_duration, plan_held, backup_held,
            )
        else:
            held = db.place_hold(conn, job, est_duration)
            log.info("job %s: %.0fs of audio, %d credits held", job["id"], est_duration, held)

    # Reuse: if this exact platform video was already transcribed at the same
    # tier / speaker-labels / language, copy that transcript instead of paying to
    # transcribe again. The customer is still charged normally (complete_job bills
    # the same as a fresh run). Dev can switch this off via the reuseTranscripts
    # setting to force a fresh transcription while testing.
    if video_id and est_duration is not None and db.get_setting(conn, "reuseTranscripts", True):
        cached = db.find_reusable_transcript(
            conn, job["user_id"], video_id, job["tier"], job["diarize"],
            job.get("language_hint")
        )
        if cached:
            _reuse(conn, job, video_id, cached, on_subscription)
            return

    # 2. Fetch the full media (uploads were already fetched by the probe).
    db.set_status(conn, job["id"], "downloading")
    if src is None:
        src = media.download_url(job["source_url"], workdir)
    if est_duration is None:
        est_duration = media.probe_file(src)
        _check_duration(est_duration)
        db.reserve_provider_spend(conn, job, est_duration)
        if on_subscription:
            plan_held, backup_held = db.place_subscription_hold(conn, job, est_duration)
            log.info(
                "job %s: %.0fs, %d plan minutes and %d backup credits held",
                job["id"], est_duration, plan_held, backup_held,
            )
        else:
            held = db.place_hold(conn, job, est_duration)
            log.info("job %s: %.0fs of audio, %d credits held", job["id"], est_duration, held)

    # 3. Normalize to compact mono audio; its ffprobe duration is what we bill.
    audio = media.normalize(src, workdir)
    actual_duration = media.probe_file(audio)
    _check_duration(actual_duration)
    # If normalization crosses a whole-minute boundary, reserve only the
    # incremental projected cost before contacting the provider.
    db.reserve_provider_spend(conn, job, actual_duration)

    # 4. Transcribe (passing the user's language hint, if any).
    db.mark_provider_call_started(conn, job["id"], backend, model_name)
    provider = providers.get_provider(backend)
    result = provider.transcribe(audio, model_name, job, language=language_hint)

    # 5. Store transcript and settle (credits or subscription minutes).
    segments = result["segments"]
    text = "\n".join(s["text"] for s in segments if s["text"])
    if on_subscription:
        db.complete_job_subscription(conn, job, actual_duration, text, segments, result.get("language"))
    else:
        db.complete_job(conn, job, actual_duration, text, segments, result.get("language"))

    # 6. Retain the compressed audio so the user can play it back next to the
    #    transcript (cleaned up after AUDIO_RETENTION_DAYS by the sweep).
    if config.AUDIO_RETENTION_DAYS > 0:
        try:
            key = f"audio/{job['id']}.ogg"
            storage.persist(audio, key)
            db.set_audio(conn, job["id"], key, config.AUDIO_RETENTION_DAYS)
        except Exception:
            log.warning("could not retain audio for job %s", job["id"], exc_info=True)

    log.info("job %s completed (%d segments)", job["id"], len(segments))


def process_batch(conn: psycopg.Connection, batch: dict[str, Any]) -> None:
    """Expand a playlist into its videos so the user can confirm the price."""
    try:
        ssrf.check_url(batch["source_url"])
        items = media.expand_playlist(batch["source_url"])
        total = sum(it["duration"] or 0 for it in items)
        db.set_batch_ready(conn, batch["id"], items, total)
        log.info("batch %s expanded: %d videos", batch["id"], len(items))
    except JobError as exc:
        log.warning("batch %s failed: %s", batch["id"], exc)
        db.fail_batch(conn, batch["id"], str(exc))
    except Exception:
        log.exception("batch %s crashed", batch["id"])
        db.fail_batch(conn, batch["id"], "Could not read the playlist.")


def sweep_expired_audio(conn: psycopg.Connection) -> int:
    """Delete retained audio whose retention window has passed."""
    rows = conn.execute(
        "SELECT id, audio_key FROM jobs WHERE audio_key IS NOT NULL AND audio_expires_at < now()"
    ).fetchall()
    removed = 0
    for row in rows:
        if storage.delete_key(row["audio_key"]):
            conn.execute("UPDATE jobs SET audio_key = NULL WHERE id = %s", (row["id"],))
            removed += 1
    return removed


def sweep_expired_uploads(conn: psycopg.Connection) -> int:
    """Delete abandoned upload intents and their objects after expiry."""
    rows = conn.execute(
        """
        SELECT key FROM uploads
        WHERE claimed_at IS NULL AND expires_at < now()
        FOR UPDATE SKIP LOCKED
        """
    ).fetchall()
    removed = 0
    for row in rows:
        if storage.delete_key(row["key"]):
            conn.execute("DELETE FROM uploads WHERE key = %s", (row["key"],))
            removed += 1
    return removed
