"""Pick which transcription backend + model a job uses.

Standard is Groq Whisper Large V3 Turbo. Premium is Soniox async v5. Language
hints are passed through to the selected provider and never change the route.
"""
from typing import Optional

from . import config


def resolve(tier: str, language_hint: Optional[str]) -> tuple[Optional[str], str]:
    """Return (backend_name, model). backend_name is None for an unknown tier."""
    if config.TRANSCRIBE_BACKEND:
        # Forced backend for development/self-hosting/tests. Pick the matching
        # hosted model so forcing Groq or Soniox cannot send an invalid model id.
        model = (
            config.PREMIUM_MODEL
            if config.TRANSCRIBE_BACKEND == "soniox"
            else config.STANDARD_MODEL
        )
        return config.TRANSCRIBE_BACKEND, model

    if tier == "premium":
        return config.PREMIUM_BACKEND, config.PREMIUM_MODEL

    if tier == "standard":
        return config.STANDARD_BACKEND, config.STANDARD_MODEL

    return None, ""
