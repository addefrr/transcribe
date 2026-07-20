"""Run faster-whisper on this machine (CPU or local GPU)."""
import logging
from typing import Any, Optional

from .. import config

log = logging.getLogger(__name__)

_models: dict[str, Any] = {}


def _get_model(name: str):
    if name not in _models:
        from faster_whisper import WhisperModel

        log.info("loading whisper model %r (device=%s)", name, config.WHISPER_DEVICE)
        _models[name] = WhisperModel(
            name, device=config.WHISPER_DEVICE, compute_type=config.WHISPER_COMPUTE
        )
    return _models[name]


def _model_for_tier(tier: str) -> str:
    # The tier→model map holds API model ids (Groq/AssemblyAI); when running the
    # local backend instead, resolve to a faster-whisper size from our own env.
    return config.WHISPER_MODEL_PREMIUM if tier == "premium" else config.WHISPER_MODEL_STANDARD


def transcribe(audio_path: str, model_name: str, job: dict, language: Optional[str] = None) -> dict:
    model = _get_model(_model_for_tier(job["tier"]))
    segments, info = model.transcribe(audio_path, vad_filter=True, language=language)
    segs = [
        {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
        for s in segments
    ]
    return {"language": info.language, "segments": segs}
