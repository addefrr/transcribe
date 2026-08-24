"""Transcribe Premium jobs with Soniox's asynchronous Speech-to-Text API.

The worker uploads normalized audio, starts an async transcription, polls until
completion, converts token timestamps/speaker IDs into our segment shape, and
then removes the temporary Soniox transcription and file.
"""
import logging
import time
from collections import Counter
from typing import Optional

import requests

from .. import config
from ..errors import JobError

log = logging.getLogger(__name__)

_MAX_POLL_FAILURES = 10
_SENTENCE_ENDINGS = (".", "!", "?", "。", "！", "？")


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {config.SONIOX_API_KEY}"}


def _service_error(response: requests.Response, fallback: str) -> JobError:
    if response.status_code == 429:
        return JobError("Transcription service is rate-limited right now; please retry shortly.")
    log.warning("soniox returned HTTP %s: %s", response.status_code, response.text[:300])
    return JobError(f"{fallback} (HTTP {response.status_code}).")


def transcribe(
    audio_path: str,
    model_name: str,
    job: dict,
    language: Optional[str] = None,
) -> dict:
    if not config.SONIOX_API_KEY:
        raise JobError("Transcription backend is not configured (missing SONIOX_API_KEY).")

    base = config.SONIOX_BASE_URL.rstrip("/")
    file_id: Optional[str] = None
    transcription_id: Optional[str] = None
    session = requests.Session()
    session.headers.update(_headers())

    try:
        try:
            with open(audio_path, "rb") as audio:
                uploaded = session.post(
                    f"{base}/files",
                    files={"file": ("audio.ogg", audio, "audio/ogg")},
                    data={"client_reference_id": str(job["id"])},
                    timeout=600,
                )
        except requests.RequestException as exc:
            raise JobError("Could not upload audio to the transcription service.") from exc
        if not uploaded.ok:
            raise _service_error(uploaded, "Transcription service rejected the audio upload")
        try:
            file_id = uploaded.json()["id"]
        except (KeyError, ValueError) as exc:
            raise JobError("Transcription service returned an invalid upload response.") from exc

        request_body: dict = {
            "model": model_name,
            "file_id": file_id,
            "client_reference_id": str(job["id"]),
            "enable_language_identification": True,
            "enable_speaker_diarization": bool(job.get("diarize")),
        }
        if language:
            request_body["language_hints"] = [language]

        try:
            created = session.post(
                f"{base}/transcriptions", json=request_body, timeout=30
            )
        except requests.RequestException as exc:
            raise JobError("Could not start transcription.") from exc
        if not created.ok:
            raise _service_error(created, "Transcription service rejected the job")
        try:
            transcription_id = created.json()["id"]
        except (KeyError, ValueError) as exc:
            raise JobError("Transcription service returned an invalid job response.") from exc

        log.info("soniox transcription %s started for job %s", transcription_id, job["id"])
        _poll(session, base, transcription_id)

        try:
            response = session.get(
                f"{base}/transcriptions/{transcription_id}/transcript", timeout=30
            )
        except requests.RequestException as exc:
            raise JobError("Could not retrieve the finished transcription.") from exc
        if not response.ok:
            raise _service_error(response, "Could not retrieve the finished transcription")
        try:
            return _parse(response.json())
        except ValueError as exc:
            raise JobError("Transcription service returned an invalid transcript.") from exc
    finally:
        # Soniox stores both objects until explicitly removed. Cleanup failures
        # must not discard an otherwise successful customer transcript.
        if transcription_id:
            _delete(session, f"{base}/transcriptions/{transcription_id}")
        if file_id:
            _delete(session, f"{base}/files/{file_id}")
        session.close()


def _poll(session: requests.Session, base: str, transcription_id: str) -> None:
    deadline = time.monotonic() + config.SONIOX_TIMEOUT_SECONDS
    failures = 0
    while time.monotonic() < deadline:
        try:
            response = session.get(f"{base}/transcriptions/{transcription_id}", timeout=30)
            if not response.ok:
                raise requests.HTTPError(response=response)
            status = response.json()
        except (requests.RequestException, ValueError) as exc:
            failures += 1
            if failures >= _MAX_POLL_FAILURES:
                raise JobError("Lost contact with the transcription service.") from exc
            time.sleep(config.SONIOX_POLL_SECONDS)
            continue

        failures = 0
        if status.get("status") == "completed":
            return
        if status.get("status") == "error":
            message = str(status.get("error_message") or "Unknown transcription error")
            raise JobError(f"Transcription failed: {message}"[:500])
        time.sleep(config.SONIOX_POLL_SECONDS)
    raise JobError("Transcription timed out.")


def _delete(session: requests.Session, url: str) -> None:
    try:
        response = session.delete(url, timeout=30)
        if not response.ok:
            log.warning("could not clean up Soniox resource %s (HTTP %s)", url, response.status_code)
    except requests.RequestException:
        log.warning("could not clean up Soniox resource %s", url, exc_info=True)


def _parse(payload: dict) -> dict:
    """Convert Soniox subword tokens into readable timestamped segments."""
    tokens = [token for token in (payload.get("tokens") or []) if token.get("text")]
    if not tokens:
        text = str(payload.get("text") or "").strip()
        segments = [{"start": 0.0, "end": 0.0, "text": text}] if text else []
        return {"language": None, "segments": segments}

    language_weights: Counter[str] = Counter()
    segments: list[dict] = []
    current: list[dict] = []
    current_speaker: Optional[str] = None

    def flush() -> None:
        nonlocal current
        if not current:
            return
        text = "".join(str(token.get("text") or "") for token in current).strip()
        if text:
            start_ms = current[0].get("start_ms") or 0
            end_ms = current[-1].get("end_ms") or start_ms
            segment = {
                "start": round(float(start_ms) / 1000, 2),
                "end": round(float(end_ms) / 1000, 2),
                "text": text,
            }
            speaker = current[0].get("speaker")
            if speaker is not None:
                segment["speaker"] = f"Speaker {speaker}"
            segments.append(segment)
        current = []

    for token in tokens:
        speaker = token.get("speaker")
        language = token.get("language")
        if language:
            language_weights[str(language)] += max(1, len(str(token.get("text") or "").strip()))

        if current and speaker != current_speaker:
            flush()
        current_speaker = speaker
        current.append(token)

        start_ms = current[0].get("start_ms") or 0
        end_ms = token.get("end_ms") or start_ms
        duration_ms = max(0, float(end_ms) - float(start_ms))
        text = str(token.get("text") or "").rstrip()
        if duration_ms >= 15_000 or (duration_ms >= 3_000 and text.endswith(_SENTENCE_ENDINGS)):
            flush()
            current_speaker = None
    flush()

    language = language_weights.most_common(1)[0][0] if language_weights else None
    return {"language": language, "segments": segments}
