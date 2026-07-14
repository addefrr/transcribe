import logging
import shutil
import tempfile
from typing import Any

import psycopg

from . import config, db, media, providers, ssrf, storage
from .errors import JobError

log = logging.getLogger(__name__)


def process_job(conn: psycopg.Connection, job: dict[str, Any]) -> None:
    workdir = tempfile.mkdtemp(prefix=f"job-{job['id']}-")
    try:
        _run(conn, job, workdir)
    except JobError as exc:
        log.warning("job %s failed: %s", job["id"], exc)
        db.fail_job(conn, job, str(exc))
    except Exception:
        log.exception("job %s crashed", job["id"])
        db.fail_job(conn, job, "Internal error while processing this job.")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


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
