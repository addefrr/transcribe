"""Transcribe via AssemblyAI — used for the Premium tier for its long-form
accuracy. Flow: upload the audio, create a transcript, poll until done, then
pull sentence-level segments with timestamps.
"""
import logging
import time
from typing import Optional

import requests

from .. import config
from ..errors import JobError

log = logging.getLogger(__name__)

_POLL_SECONDS = 3
_MAX_POLL_FAILURES = 10


def _headers() -> dict:
    return {"Authorization": config.ASSEMBLYAI_API_KEY}


def transcribe(audio_path: str, model_name: str, job: dict, language: Optional[str] = None) -> dict:
    if not config.ASSEMBLYAI_API_KEY:
        raise JobError("Transcription backend is not configured (missing ASSEMBLYAI_API_KEY).")
    base = config.ASSEMBLYAI_BASE_URL

    # 1. Upload the local audio; AssemblyAI streams it to its own storage.
    try:
        with open(audio_path, "rb") as fh:
            up = requests.post(f"{base}/upload", headers=_headers(), data=fh, timeout=600)
        up.raise_for_status()
        upload_url = up.json()["upload_url"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise JobError("Could not upload audio to the transcription service.") from exc

    # 2. Kick off the transcript. speech_model carries the tier's model choice;
    #    language auto-detection unless the job pinned one; speaker_labels when
    #    the user asked to recognize speakers.
    diarize = bool(job.get("diarize"))
    request_body: dict = {"audio_url": upload_url, "speech_model": model_name}
    if language:
        request_body["language_code"] = language
    else:
        request_body["language_detection"] = True
    if diarize:
        request_body["speaker_labels"] = True
    try:
        created = requests.post(f"{base}/transcript", headers=_headers(), json=request_body, timeout=30)
        created.raise_for_status()
        transcript_id = created.json()["id"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise JobError("Transcription service rejected the job.") from exc
    log.info("assemblyai transcript %s started for job %s", transcript_id, job["id"])

    # 3. Poll to completion, tolerating transient status-endpoint failures.
    status = _poll(base, transcript_id)
    if status.get("status") == "error":
        raise JobError(f"Transcription failed: {status.get('error', '')}"[:500])

    # 4. Segments: speaker-labelled utterances when diarizing, else sentences.
    if diarize:
        segments = _utterance_segments(status.get("utterances") or [])
    else:
        segments = _fetch_sentences(base, transcript_id)
    if not segments and status.get("text"):
        segments = [{"start": 0.0, "end": 0.0, "text": status["text"].strip()}]
    return {"language": status.get("language_code"), "segments": segments}


def _utterance_segments(utterances: list[dict]) -> list[dict]:
    """AssemblyAI speaker-labelled utterances → segments carrying a speaker."""
    return [
        {
            "start": round((u.get("start") or 0) / 1000, 2),
            "end": round((u.get("end") or 0) / 1000, 2),
            "text": (u.get("text") or "").strip(),
            "speaker": f"Speaker {u.get('speaker')}" if u.get("speaker") else None,
        }
        for u in utterances
    ]


def _poll(base: str, transcript_id: str) -> dict:
    deadline = time.monotonic() + config.ASSEMBLYAI_TIMEOUT_SECONDS
    failures = 0
    while time.monotonic() < deadline:
        time.sleep(_POLL_SECONDS)
        try:
            resp = requests.get(f"{base}/transcript/{transcript_id}", headers=_headers(), timeout=30)
            resp.raise_for_status()
            status = resp.json()
        except (requests.RequestException, ValueError) as exc:
            failures += 1
            if failures >= _MAX_POLL_FAILURES:
                raise JobError("Lost contact with the transcription service.") from exc
            continue
        failures = 0
        if status.get("status") in ("completed", "error"):
            return status
    raise JobError("Transcription timed out.")


def _fetch_sentences(base: str, transcript_id: str) -> list[dict]:
    try:
        resp = requests.get(
            f"{base}/transcript/{transcript_id}/sentences", headers=_headers(), timeout=30
        )
        resp.raise_for_status()
        sentences = resp.json().get("sentences") or []
    except (requests.RequestException, ValueError):
        return []
    return [
        {
            "start": round((s.get("start") or 0) / 1000, 2),
            "end": round((s.get("end") or 0) / 1000, 2),
            "text": (s.get("text") or "").strip(),
        }
        for s in sentences
    ]
