import logging
import shutil
import tempfile
import threading
from typing import Any

import psycopg

from . import config, db, media, providers, ssrf, storage
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
        _cleanup_source(job)
    except JobError as exc:
        log.warning("job %s failed: %s", job["id"], exc)
        db.fail_job(conn, job, str(exc))
        _cleanup_source(job)
    except Exception:
        log.exception("job %s crashed", job["id"])
        db.fail_job(conn, job, "Internal error while processing this job.")
        _cleanup_source(job)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _cleanup_source(job: dict[str, Any]) -> None:
    """Delete the uploaded source once the job is terminal. Deliberately not
    reached when fail_job itself raised — a requeued job still needs the file."""
    if job["source_type"] == "upload" and job["upload_key"]:
        storage.delete_key(job["upload_key"])


def _check_duration(duration: float) -> None:
    if duration > config.MAX_DURATION_SECONDS:
        raise JobError(
            f"Media is {duration / 3600:.1f}h long; the maximum is "
            f"{config.MAX_DURATION_SECONDS / 3600:.1f}h."
        )


def _run(conn: psycopg.Connection, job: dict[str, Any], workdir: str) -> None:
    tier = job["tier"]
    model_name = config.TIER_MODELS.get(tier)
    if model_name is None:
        raise JobError(f"Unknown quality tier {tier!r}.")

    # 1. Probe duration (cheap, no full download) and reserve credits.
    #    Direct file URLs expose no duration metadata, so for those the hold
    #    happens right after the (size-capped) download instead.
    src = None
    if job["source_type"] == "url":
        ssrf.check_url(job["source_url"])
        est_duration = media.probe_url(job["source_url"])
    else:
        src = storage.fetch_upload(job["upload_key"], workdir)
        est_duration = media.probe_file(src)

    if est_duration is not None:
        _check_duration(est_duration)
        held = db.place_hold(conn, job, est_duration)
        log.info("job %s: %.0fs of audio, %d credits held", job["id"], est_duration, held)

    # 2. Fetch the full media (uploads were already fetched by the probe).
    db.set_status(conn, job["id"], "downloading")
    if src is None:
        src = media.download_url(job["source_url"], workdir)
    if est_duration is None:
        est_duration = media.probe_file(src)
        _check_duration(est_duration)
        held = db.place_hold(conn, job, est_duration)
        log.info("job %s: %.0fs of audio, %d credits held", job["id"], est_duration, held)

    # 3. Normalize to compact mono audio; its ffprobe duration is what we bill.
    audio = media.normalize(src, workdir)
    actual_duration = media.probe_file(audio)

    # 4. Transcribe.
    db.set_status(conn, job["id"], "transcribing")
    provider = providers.get_provider()
    result = provider.transcribe(audio, model_name, job)

    # 5. Store transcript and settle credits.
    segments = result["segments"]
    text = "\n".join(s["text"] for s in segments if s["text"])
    db.complete_job(conn, job, actual_duration, text, segments, result.get("language"))
    log.info("job %s completed (%d segments)", job["id"], len(segments))
