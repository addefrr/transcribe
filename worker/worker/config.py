import os


def _repo_default(*parts: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "..", *parts))


DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/transcribe"
)

# Storage of user uploads. API backends read the normalized audio from the
# local workdir directly, so "local" is fine even in production; "s3" is only
# needed when the web app and worker run on different machines.
STORAGE_DRIVER = os.environ.get("STORAGE_DRIVER", "local")  # local | s3
# Shared with the web app. A relative UPLOAD_DIR is resolved against the repo
# root (not the process cwd) so the web service (cwd=web/) and this worker
# (cwd=worker/) always agree on where uploads live; absolute paths pass through.
_upload_env = os.environ.get("UPLOAD_DIR")
UPLOAD_DIR = os.path.join(_repo_default(), _upload_env) if _upload_env else _repo_default("data", "uploads")
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_REGION = os.environ.get("S3_REGION", "auto")
S3_BUCKET = os.environ.get("S3_BUCKET", "transcribe")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")
S3_FORCE_PATH_STYLE = os.environ.get("S3_FORCE_PATH_STYLE", "1") == "1"

# Transcription routing (see worker/routing.py). Standard always uses Groq's
# Whisper large-v3-turbo; Premium always uses Soniox's asynchronous v5 model.
#
# TRANSCRIBE_BACKEND, if set, forces every job onto one backend — handy for a
# fully self-hosted setup ("local") or tests ("fake").
TRANSCRIBE_BACKEND = os.environ.get("TRANSCRIBE_BACKEND", "")

STANDARD_BACKEND = "groq"
STANDARD_MODEL = os.environ.get("STANDARD_MODEL", "whisper-large-v3-turbo")
PREMIUM_BACKEND = "soniox"
PREMIUM_MODEL = os.environ.get("PREMIUM_MODEL", "stt-async-v5")

# --- Groq (OpenAI-compatible speech-to-text) ---
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

# --- Soniox asynchronous speech-to-text ---
SONIOX_API_KEY = os.environ.get("SONIOX_API_KEY", "")
SONIOX_BASE_URL = os.environ.get("SONIOX_BASE_URL", "https://api.soniox.com/v1")
SONIOX_TIMEOUT_SECONDS = int(os.environ.get("SONIOX_TIMEOUT_SECONDS", "3600"))
SONIOX_POLL_SECONDS = float(os.environ.get("SONIOX_POLL_SECONDS", "1"))

# --- local faster-whisper backend (self-host on your own machine/GPU) ---
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "auto")
WHISPER_MODEL_STANDARD = os.environ.get("WHISPER_MODEL_STANDARD", "small")
WHISPER_MODEL_PREMIUM = os.environ.get("WHISPER_MODEL_PREMIUM", "large-v3")

# Keep the compressed audio this many days so users can play it back next to the
# transcript; 0 disables retention entirely.
AUDIO_RETENTION_DAYS = int(os.environ.get("AUDIO_RETENTION_DAYS", "7"))

MAX_PLAYLIST_ITEMS = int(os.environ.get("MAX_PLAYLIST_ITEMS", "100"))
MAX_ACTIVE_JOBS_PER_USER = max(
    1, int(os.environ.get("MAX_ACTIVE_JOBS_PER_USER", "3"))
)

MAX_DURATION_SECONDS = int(os.environ.get("MAX_DURATION_SECONDS", str(4 * 3600)))
MAX_FILESIZE_BYTES = int(os.environ.get("MAX_FILESIZE_BYTES", str(2 * 1024**3)))
# Upper bound for a single ffmpeg normalization/segmentation operation. This
# prevents malformed media from occupying a worker indefinitely.
MEDIA_COMMAND_TIMEOUT_SECONDS = int(os.environ.get("MEDIA_COMMAND_TIMEOUT_SECONDS", "1800"))
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "2"))
STALE_JOB_MINUTES = int(os.environ.get("STALE_JOB_MINUTES", "30"))
SSRF_ALLOW_PRIVATE = os.environ.get("SSRF_ALLOW_PRIVATE", "0") == "1"
