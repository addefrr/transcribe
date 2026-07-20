"""Transcribe via Qwen3-ASR-Flash (Alibaba DashScope, OpenAI-compatible).

Qwen is the Standard tier's default engine: cheaper than Whisper/Parakeet and
more accurate on its supported languages (English + Asian in particular). Its
API caps each request at ~3 min / 10 MB, so longer audio is split into chunks
here and stitched back with offset timestamps.

NOTE: the exact DashScope request/response schema for Qwen3-ASR should be
confirmed against current docs; this targets the documented OpenAI-compatible
/audio/transcriptions interface, and _parse() is isolated so a schema tweak is
a one-function change.
"""
import logging
import os
from typing import Optional

import requests

from .. import config, media
from ..errors import JobError

log = logging.getLogger(__name__)


def transcribe(audio_path: str, model_name: str, job: dict, language: Optional[str] = None) -> dict:
    if not config.QWEN_API_KEY:
        raise JobError("Transcription backend is not configured (missing QWEN_API_KEY).")

    duration = media.probe_file(audio_path)
    if duration > config.QWEN_CHUNK_SECONDS:
        chunks = media.segment(audio_path, os.path.dirname(audio_path), config.QWEN_CHUNK_SECONDS)
    else:
        chunks = [(0.0, audio_path)]

    segments: list[dict] = []
    detected = language
    for offset, chunk_path in chunks:
        result = _transcribe_chunk(chunk_path, model_name, language)
        detected = detected or result.get("language")
        for s in result["segments"]:
            segments.append(
                {
                    "start": round(s["start"] + offset, 2),
                    "end": round(s["end"] + offset, 2),
                    "text": s["text"],
                }
            )
    return {"language": detected, "segments": segments}


def _transcribe_chunk(audio_path: str, model_name: str, language: Optional[str]) -> dict:
    data = {"model": model_name, "response_format": "verbose_json"}
    if language:
        data["language"] = language
    try:
        with open(audio_path, "rb") as fh:
            resp = requests.post(
                f"{config.QWEN_BASE_URL}/audio/transcriptions",
                headers={"Authorization": f"Bearer {config.QWEN_API_KEY}"},
                data=data,
                files={"file": ("audio.ogg", fh, "audio/ogg")},
                timeout=300,
            )
    except requests.RequestException as exc:
        raise JobError("Could not reach the transcription service.") from exc

    if resp.status_code == 429:
        raise JobError("Transcription service is rate-limited right now; please retry shortly.")
    if resp.status_code != 200:
        log.warning("qwen returned HTTP %s: %s", resp.status_code, resp.text[:300])
        raise JobError(f"Transcription service error (HTTP {resp.status_code}).")

    payload = resp.json()
    # Only pay for an extra ffprobe when we actually need a fallback span.
    fallback = 0.0 if payload.get("segments") else media.probe_file(audio_path)
    return _parse(payload, fallback_duration=fallback)


def _parse(payload: dict, fallback_duration: float) -> dict:
    """Map the response to our {language, segments} shape. If the API returned
    only flat text (no per-segment timestamps), emit one segment spanning the
    chunk so downstream offsets still place it correctly."""
    raw_segments = payload.get("segments") or []
    segments = [
        {
            "start": round(float(s.get("start", 0.0)), 2),
            "end": round(float(s.get("end", 0.0)), 2),
            "text": (s.get("text") or "").strip(),
        }
        for s in raw_segments
    ]
    if not segments and payload.get("text"):
        segments = [{"start": 0.0, "end": round(fallback_duration, 2), "text": payload["text"].strip()}]
    return {"language": payload.get("language"), "segments": segments}
