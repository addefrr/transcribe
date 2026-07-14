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


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.RUNPOD_API_KEY}"}


def transcribe(audio_path: str, model_name: str, job: dict, language: Optional[str] = None) -> dict:
    if not config.RUNPOD_API_KEY or not config.RUNPOD_ENDPOINT_ID:
        raise JobError("Transcription backend is not configured (missing RunPod credentials).")
    if config.STORAGE_DRIVER != "s3":
        raise JobError("The RunPod backend requires STORAGE_DRIVER=s3.")

    key = f"audio/{job['id']}.ogg"
    storage.put_file(audio_path, key)
    audio_url = storage.presign_get(key)

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
    while time.monotonic() < deadline:
        time.sleep(_POLL_SECONDS)
        status = requests.get(f"{base}/status/{run_id}", headers=_headers(), timeout=30).json()
        state = status.get("status")
        if state == "COMPLETED":
            output = status.get("output") or {}
            if "segments" not in output:
                raise JobError("GPU endpoint returned no transcript.")
            return {"language": output.get("language"), "segments": output["segments"]}
        if state in ("FAILED", "CANCELLED", "TIMED_OUT"):
            raise JobError(f"GPU transcription {state.lower()}: {status.get('error', '')}"[:500])
    requests.post(f"{base}/cancel/{run_id}", headers=_headers(), timeout=30)
    raise JobError("GPU transcription timed out.")
