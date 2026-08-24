import glob
import json
import os
import re
import subprocess
from typing import Optional

from . import config
from .errors import JobError


def _ydl_opts(extra: dict) -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "extractor_retries": 3,
        "fragment_retries": 3,
        **extra,
    }


def _run_command(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise JobError("Media processing timed out. Try a shorter or different file.") from exc


def probe_url(url: str) -> tuple[Optional[float], Optional[str], Optional[str]]:
    """(duration_seconds, title, video_id) from URL metadata only — nothing is
    downloaded. video_id is a canonical "<extractor>:<id>" for platform videos
    (used to reuse an existing transcript), or None for generic/unknown URLs."""
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
    title = info.get("title") or None
    extractor = (info.get("extractor_key") or info.get("extractor") or "").lower()
    vid = info.get("id")
    video_id = f"{extractor}:{vid}" if vid and extractor and extractor != "generic" else None
    return (float(duration) if duration else None, title, video_id)


def expand_playlist(url: str) -> list[dict]:
    """Expand a playlist into [{url, title, duration}] without downloading.

    Uses flat extraction (metadata only), so it's fast even for large playlists.
    """
    import yt_dlp

    opts = _ydl_opts({"extract_flat": "in_playlist", "skip_download": True})
    # This call intends to fetch a playlist, so allow it (base opts set noplaylist).
    opts["noplaylist"] = False
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        raise JobError(f"Could not read the playlist: {exc}") from exc

    entries = info.get("entries")
    if not entries:
        raise JobError("That playlist is empty or couldn't be read.")

    items: list[dict] = []
    for entry in entries:
        if not entry:
            continue
        vid_url = entry.get("url") or entry.get("webpage_url")
        vid_id = entry.get("id")
        if not vid_url and vid_id:
            vid_url = f"https://www.youtube.com/watch?v={vid_id}"
        if not vid_url:
            continue
        duration = entry.get("duration")
        items.append(
            {
                "url": vid_url,
                "title": (entry.get("title") or "").strip()[:300],
                "duration": float(duration) if duration else None,
            }
        )
        # Never silently truncate a playlist: the customer must see and confirm
        # the complete item count and charge. Reading one item beyond the cap is
        # enough to reject it without walking an unbounded lazy playlist.
        if len(items) > config.MAX_PLAYLIST_ITEMS:
            raise JobError(
                f"This playlist has more than {config.MAX_PLAYLIST_ITEMS} playable items. "
                "Use a smaller playlist or submit individual videos."
            )
    if not items:
        raise JobError("That playlist has no playable videos.")
    return items


def _size_cap_hook(progress: dict) -> None:
    # yt-dlp's max_filesize only applies when the server declares a size up
    # front; this hook also aborts unbounded (chunked/streamed) downloads.
    downloaded = progress.get("downloaded_bytes") or 0
    total = progress.get("total_bytes") or progress.get("total_bytes_estimate") or 0
    if max(downloaded, total) > config.MAX_FILESIZE_BYTES:
        raise JobError("Download exceeds the maximum file size.")


def download_url(url: str, workdir: str) -> str:
    """Download best available audio (or full media if audio-only isn't offered)."""
    import yt_dlp

    opts = _ydl_opts(
        {
            "outtmpl": os.path.join(workdir, "source.%(ext)s"),
            "format": "bestaudio/best",
            "max_filesize": config.MAX_FILESIZE_BYTES,
            "progress_hooks": [_size_cap_hook],
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


_TIME_RE = re.compile(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)")


def _measure_by_decode(path: str) -> Optional[float]:
    """Duration by decoding the whole file — the reliable fallback when the
    container header has no duration (e.g. browser MediaRecorder WebM/Opus,
    which is written as a live stream and never gets a finalized duration).
    Decodes audio only to /dev/null and reads ffmpeg's final `time=` stat."""
    proc = _run_command(
        ["ffmpeg", "-nostdin", "-v", "error", "-stats", "-i", path, "-vn", "-f", "null", "-"],
        config.MEDIA_COMMAND_TIMEOUT_SECONDS,
    )
    if proc.returncode != 0:
        return None
    # ffmpeg rewrites the stats line with \r; the last time= is the total length.
    matches = _TIME_RE.findall(proc.stderr)
    if not matches:
        return None
    h, m, s = matches[-1]
    return int(h) * 3600 + int(m) * 60 + float(s)


def probe_file(path: str) -> float:
    """Exact duration in seconds — authoritative for billing. Reads the fast
    container metadata first, then falls back to a full decode for files whose
    header omits the duration."""
    proc = _run_command(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json", path,
        ],
        min(120, config.MEDIA_COMMAND_TIMEOUT_SECONDS),
    )
    if proc.returncode != 0:
        raise JobError("File is not a readable audio/video file.")
    duration: Optional[float]
    try:
        duration = float(json.loads(proc.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError):
        duration = None
    if duration is None or duration <= 0:
        duration = _measure_by_decode(path)
    if duration is None:
        raise JobError("Could not determine media duration.")
    if duration <= 0:
        raise JobError("Media has zero duration.")
    return duration


def segment(src: str, workdir: str, seconds: int) -> list[tuple[float, str]]:
    """Split audio into ≤`seconds` chunks. Returns (offset_seconds, path) pairs;
    offsets come from each chunk's real probed duration, so timestamps stitched
    back with them don't drift even if ffmpeg snaps cuts to packet boundaries."""
    pattern = os.path.join(workdir, "chunk_%04d.ogg")
    proc = _run_command(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", src,
            "-f", "segment", "-segment_time", str(seconds),
            # Reset each segment's clock to 0 so its probed duration is its own
            # length, not a cumulative end-timestamp inherited from the source.
            "-reset_timestamps", "1", "-c", "copy",
            pattern,
        ],
        config.MEDIA_COMMAND_TIMEOUT_SECONDS,
    )
    if proc.returncode != 0:
        raise JobError(f"Audio segmentation failed: {proc.stderr.strip()[:500]}")
    paths = sorted(glob.glob(os.path.join(workdir, "chunk_*.ogg")))
    if not paths:
        raise JobError("Audio segmentation produced no chunks.")
    chunks: list[tuple[float, str]] = []
    offset = 0.0
    for path in paths:
        chunks.append((offset, path))
        offset += probe_file(path)
    return chunks


def normalize(src: str, workdir: str) -> str:
    """Extract mono Opus audio — small enough to ship to a GPU endpoint quickly,
    and directly decodable by faster-whisper."""
    out = os.path.join(workdir, "audio.ogg")
    proc = _run_command(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", src,
            "-vn", "-ac", "1", "-c:a", "libopus", "-b:a", "32k",
            out,
        ],
        config.MEDIA_COMMAND_TIMEOUT_SECONDS,
    )
    if proc.returncode != 0:
        raise JobError(f"Audio extraction failed: {proc.stderr.strip()[:500]}")
    return out
