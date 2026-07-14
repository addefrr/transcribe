"""Send audio to a RunPod Serverless endpoint running gpu/handler.py.

Requires STORAGE_DRIVER=s3: the normalized audio is uploaded to the bucket and
the endpoint receives a presigned GET URL (RunPod payload limits rule out
inlining the audio).
"""
import logging
import time
from typing import Optional

import requests

from .. import config, storage
from ..errors import JobError

log = logging.getLogger(__name__)

_POLL_SECONDS = 3
_MAX_POLL_FAILURES = 10


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.RUNPOD_API_KEY}"}


def transcribe(audio_path: str, model_name: str, job: dict, language: Optional[str] = None) -> dict:
    if not config.RUNPOD_API_KEY or not config.RUNPOD_ENDPOINT_ID:
        raise JobError("Transcription backend is not configured (missing RunPod credentials).")
    if config.STORAGE_DRIVER != "s3":
        raise JobError("The RunPod backend requires STORAGE_DRIVER=s3.")

    key = f"audio/{job['id']}.ogg"
    storage.put_file(audio_path, key)
    try:
        return _run_and_poll(storage.presign_get(key), model_name, job, language)
    finally:
        storage.delete_key(key)


def _run_and_poll(audio_url: str, model_name: str, job: dict, language: Optional[str]) -> dict:
    base = f"https://api.runpod.ai/v2/{config.RUNPOD_ENDPOINT_ID}"
    resp = requests.post(
        f"{base}/run",
        json={"input": {"audio_url": audio_url, "model": model_name, "language": language}},
        headers=_headers(),
        timeout=30,
    )
    if resp.status_code != 200:
        raise JobError(f"GPU endpoint rejected the job (HTTP {resp.status_code}).")
    run_id = resp.json()["id"]
    log.info("runpod run %s started for job %s", run_id, job["id"])

    deadline = time.monotonic() + config.RUNPOD_TIMEOUT_SECONDS
    poll_failures = 0
    while time.monotonic() < deadline:
        time.sleep(_POLL_SECONDS)
        # A blip in RunPod's status API must not fail a run that's still
        # executing (and already costing GPU time) — retry within the deadline.
        try:
            resp = requests.get(f"{base}/status/{run_id}", headers=_headers(), timeout=30)
            resp.raise_for_status()
            status = resp.json()
        except (requests.RequestException, ValueError) as exc:
            poll_failures += 1
            if poll_failures >= _MAX_POLL_FAILURES:
                raise JobError("Lost contact with the GPU endpoint.") from exc
            continue
        poll_failures = 0
        state = status.get("status")
        if state == "COMPLETED":
            output = status.get("output") or {}
            if "segments" not in output:
                raise JobError("GPU endpoint returned no transcript.")
            return {"language": output.get("language"), "segments": output["segments"]}
        if state in ("FAILED", "CANCELLED", "TIMED_OUT"):
            raise JobError(f"GPU transcription {state.lower()}: {status.get('error', '')}"[:500])
    try:
        requests.post(f"{base}/cancel/{run_id}", headers=_headers(), timeout=30)
    except requests.RequestException:
        log.warning("could not cancel runpod run %s", run_id)
    raise JobError("GPU transcription timed out.")
