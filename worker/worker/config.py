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
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", _repo_default("data", "uploads"))
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_REGION = os.environ.get("S3_REGION", "auto")
S3_BUCKET = os.environ.get("S3_BUCKET", "transcribe")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")
S3_FORCE_PATH_STYLE = os.environ.get("S3_FORCE_PATH_STYLE", "1") == "1"

# Transcription routing (see worker/routing.py). The Standard tier is
# language-routed: Qwen3-ASR for the languages it covers well (cheaper + more
# accurate, especially English/Asian), and Whisper large-v3-turbo via Groq for
# the long-tail languages Qwen doesn't support. The Premium tier is AssemblyAI.
#
# TRANSCRIBE_BACKEND, if set, forces every job onto one backend — handy for a
# fully self-hosted setup ("local") or tests ("fake").
TRANSCRIBE_BACKEND = os.environ.get("TRANSCRIBE_BACKEND", "")

# ISO-639-1 codes Qwen3-ASR-Flash handles; a Standard job whose language hint is
# anything else routes to the fallback backend instead.
QWEN_LANGUAGES = frozenset(
    os.environ.get("QWEN_LANGUAGES", "zh,en,ja,ko,ar,fr,de,es,it,pt,ru").split(",")
)
QWEN_MODEL = os.environ.get("QWEN_MODEL", "qwen3-asr-flash")
STANDARD_FALLBACK_BACKEND = os.environ.get("STANDARD_FALLBACK_BACKEND", "groq")
STANDARD_FALLBACK_MODEL = os.environ.get("STANDARD_FALLBACK_MODEL", "whisper-large-v3-turbo")
PREMIUM_BACKEND = os.environ.get("PREMIUM_BACKEND", "assemblyai")
PREMIUM_MODEL = os.environ.get("PREMIUM_MODEL", "best")

# --- Qwen (DashScope, OpenAI-compatible) ---
QWEN_API_KEY = os.environ.get("QWEN_API_KEY", "")
QWEN_BASE_URL = os.environ.get(
    "QWEN_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
)
# Qwen3-ASR-Flash caps each request at ~3 min / 10 MB, so longer audio is split
# into chunks and stitched back together with offset timestamps.
QWEN_CHUNK_SECONDS = int(os.environ.get("QWEN_CHUNK_SECONDS", "170"))

# --- Groq (OpenAI-compatible speech-to-text) ---
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

# --- AssemblyAI ---
ASSEMBLYAI_API_KEY = os.environ.get("ASSEMBLYAI_API_KEY", "")
ASSEMBLYAI_BASE_URL = os.environ.get("ASSEMBLYAI_BASE_URL", "https://api.assemblyai.com/v2")
ASSEMBLYAI_TIMEOUT_SECONDS = int(os.environ.get("ASSEMBLYAI_TIMEOUT_SECONDS", "3600"))

# --- local faster-whisper backend (self-host on your own machine/GPU) ---
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "auto")
WHISPER_MODEL_STANDARD = os.environ.get("WHISPER_MODEL_STANDARD", "small")
WHISPER_MODEL_PREMIUM = os.environ.get("WHISPER_MODEL_PREMIUM", "large-v3")

# Keep the compressed audio this many days so users can play it back next to the
# transcript; 0 disables retention entirely.
AUDIO_RETENTION_DAYS = int(os.environ.get("AUDIO_RETENTION_DAYS", "7"))

MAX_PLAYLIST_ITEMS = int(os.environ.get("MAX_PLAYLIST_ITEMS", "100"))

MAX_DURATION_SECONDS = int(os.environ.get("MAX_DURATION_SECONDS", str(4 * 3600)))
MAX_FILESIZE_BYTES = int(os.environ.get("MAX_FILESIZE_BYTES", str(2 * 1024**3)))
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "2"))
STALE_JOB_MINUTES = int(os.environ.get("STALE_JOB_MINUTES", "30"))
SSRF_ALLOW_PRIVATE = os.environ.get("SSRF_ALLOW_PRIVATE", "0") == "1"
