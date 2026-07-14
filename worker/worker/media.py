import glob
import json
import os
import subprocess
from typing import Optional

from . import config
from .errors import JobError


def _ydl_opts(extra: dict) -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        **extra,
    }


def probe_url(url: str) -> Optional[float]:
    """Duration in seconds from URL metadata only — nothing is downloaded."""
    import yt_dlp

    try:
        with yt_dlp.YoutubeDL(_ydl_opts({"skip_download": True})) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        raise JobError(f"Could not read media at URL: {exc}") from exc
    if info.get("_type") == "playlist":
        entries = info.get("entries") or []
        if not entries:
            raise JobError("URL is a playlist with no entries.")
        raise JobError("Playlists are not supported — submit a single video/audio URL.")
    duration = info.get("duration")
    return float(duration) if duration else None


def download_url(url: str, workdir: str) -> str:
    """Download best available audio (or full media if audio-only isn't offered)."""
    import yt_dlp

    opts = _ydl_opts(
        {
            "outtmpl": os.path.join(workdir, "source.%(ext)s"),
            "format": "bestaudio/best",
            "max_filesize": config.MAX_FILESIZE_BYTES,
        }
    )
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
    except yt_dlp.utils.DownloadError as exc:
        raise JobError(f"Download failed: {exc}") from exc
    matches = glob.glob(os.path.join(workdir, "source.*"))
    if not matches:
        raise JobError("Download produced no file (it may exceed the size limit).")
    return matches[0]


def probe_file(path: str) -> float:
    """Exact duration in seconds via ffprobe — authoritative for billing."""
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json", path,
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise JobError("File is not a readable audio/video file.")
    try:
        duration = float(json.loads(proc.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError):
        raise JobError("Could not determine media duration.")
    if duration <= 0:
        raise JobError("Media has zero duration.")
    return duration


def normalize(src: str, workdir: str) -> str:
    """Extract mono Opus audio — small enough to ship to a GPU endpoint quickly,
    and directly decodable by faster-whisper."""
    out = os.path.join(workdir, "audio.ogg")
    proc = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", src,
            "-vn", "-ac", "1", "-c:a", "libopus", "-b:a", "32k",
            out,
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise JobError(f"Audio extraction failed: {proc.stderr.strip()[:500]}")
    return out
