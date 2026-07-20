"""Transcribe via Groq's OpenAI-compatible speech-to-text API.

Groq runs Whisper large-v3 / large-v3-turbo on LPU hardware at ~200x realtime
for a flat ~$0.04/audio-hour, so it's both cheaper and far faster than renting
a GPU — and it needs no storage round-trip: the normalized audio is posted
straight from the worker's local workdir.
"""
import logging
import os
from typing import Optional

import requests

from .. import config
from ..errors import JobError

log = logging.getLogger(__name__)

# Groq rejects uploads above this size; our normalized Opus audio is ~14 MB/hour,
# so this is comfortably clear of a few hours of audio.
_MAX_UPLOAD_BYTES = int(os.environ.get("GROQ_MAX_UPLOAD_BYTES", str(100 * 1024**2)))


def transcribe(audio_path: str, model_name: str, job: dict, language: Optional[str] = None) -> dict:
    if not config.GROQ_API_KEY:
        raise JobError("Transcription backend is not configured (missing GROQ_API_KEY).")

    size = os.path.getsize(audio_path)
    if size > _MAX_UPLOAD_BYTES:
        raise JobError(
            "Audio is too long for the Standard tier's transcription service. "
            "Try a shorter file or the Premium tier."
        )

    data = {
        "model": model_name,
        "response_format": "verbose_json",
        "timestamp_granularities[]": "segment",
    }
    if language:
        data["language"] = language

    try:
        with open(audio_path, "rb") as fh:
            resp = requests.post(
                f"{config.GROQ_BASE_URL}/audio/transcriptions",
                headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
                data=data,
                files={"file": ("audio.ogg", fh, "audio/ogg")},
                timeout=600,
            )
    except requests.RequestException as exc:
        raise JobError("Could not reach the transcription service.") from exc

    if resp.status_code == 413:
        raise JobError("Audio is too large for the Standard tier's transcription service.")
    if resp.status_code == 429:
        raise JobError("Transcription service is rate-limited right now; please retry shortly.")
    if resp.status_code != 200:
        log.warning("groq returned HTTP %s: %s", resp.status_code, resp.text[:300])
        raise JobError(f"Transcription service error (HTTP {resp.status_code}).")

    payload = resp.json()
    return _parse(payload)


def _parse(payload: dict) -> dict:
    """Map Groq/OpenAI verbose_json to our {language, segments} shape."""
    raw_segments = payload.get("segments") or []
    segments = [
        {
            "start": round(float(s.get("start", 0.0)), 2),
            "end": round(float(s.get("end", 0.0)), 2),
            "text": (s.get("text") or "").strip(),
        }
        for s in raw_segments
    ]
    # Fall back to a single untimed segment if only flat text came back.
    if not segments and payload.get("text"):
        segments = [{"start": 0.0, "end": 0.0, "text": payload["text"].strip()}]
    return {"language": payload.get("language"), "segments": segments}
