"""RunPod Serverless handler: fetch audio by URL, transcribe with faster-whisper.

Input:  {"audio_url": "...", "model": "large-v3", "language": "en" | null}
Output: {"language": "en", "duration": 123.4, "segments": [{"start","end","text"}]}
"""
import os
import tempfile

import requests
import runpod
from faster_whisper import WhisperModel

DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE = os.environ.get("WHISPER_COMPUTE", "float16")
ALLOWED_MODELS = {"tiny", "base", "small", "medium", "large-v3", "large-v3-turbo", "distil-large-v3"}

_models = {}


def _get_model(name: str) -> WhisperModel:
    if name not in ALLOWED_MODELS:
        raise ValueError(f"model {name!r} not allowed")
    if name not in _models:
        _models[name] = WhisperModel(name, device=DEVICE, compute_type=COMPUTE)
    return _models[name]


def handler(event):
    inp = event["input"]
    model = _get_model(inp.get("model", "large-v3"))

    with tempfile.NamedTemporaryFile(suffix=".audio") as tmp:
        with requests.get(inp["audio_url"], stream=True, timeout=60) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=1 << 20):
                tmp.write(chunk)
        tmp.flush()

        segments, info = model.transcribe(
            tmp.name, vad_filter=True, language=inp.get("language")
        )
        segs = [
            {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments
        ]

    return {"language": info.language, "duration": info.duration, "segments": segs}


runpod.serverless.start({"handler": handler})
