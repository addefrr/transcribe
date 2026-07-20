"""Pick which transcription backend + model a job uses.

Standard tier: Qwen3-ASR for the languages it covers well, Whisper large-v3-turbo
(via Groq) for everything else. Premium tier: AssemblyAI. The language hint is an
ISO-639-1 code chosen by the user at submission, or None for auto-detect (which
stays on Qwen, since it auto-detects among its supported languages).
"""
from typing import Optional

from . import config


def resolve(tier: str, language_hint: Optional[str]) -> tuple[Optional[str], str]:
    """Return (backend_name, model). backend_name is None for an unknown tier."""
    if config.TRANSCRIBE_BACKEND:
        # Forced backend for dev/self-host/tests; model only matters for the API
        # backends (local/fake resolve their own), so a reasonable default is fine.
        model = config.PREMIUM_MODEL if tier == "premium" else config.QWEN_MODEL
        return config.TRANSCRIBE_BACKEND, model

    if tier == "premium":
        return config.PREMIUM_BACKEND, config.PREMIUM_MODEL

    if tier == "standard":
        if language_hint and language_hint not in config.QWEN_LANGUAGES:
            return config.STANDARD_FALLBACK_BACKEND, config.STANDARD_FALLBACK_MODEL
        return "qwen", config.QWEN_MODEL

    return None, ""
