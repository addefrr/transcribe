"""Development/CI backend: returns canned segments without loading a model.

Lets the whole pipeline (probe → hold → download → normalize → settle) be
exercised on machines that can't fetch Whisper weights. Never use in prod.
"""
from typing import Optional

from .. import media


def transcribe(audio_path: str, model_name: str, job: dict, language: Optional[str] = None) -> dict:
    duration = media.probe_file(audio_path)
    step = max(duration / 3, 0.1)
    diarize = bool(job.get("diarize"))
    segments = [
        {
            "start": round(i * step, 2),
            "end": round(min((i + 1) * step, duration), 2),
            "text": f"[fake transcript segment {i + 1} — model {model_name}]",
            # Alternate speakers so the diarization UI can be exercised.
            "speaker": f"Speaker {'A' if i % 2 == 0 else 'B'}" if diarize else None,
        }
        for i in range(3)
    ]
    return {"language": language or "en", "segments": segments}
