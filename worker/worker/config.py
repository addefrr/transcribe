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

# Per-tier transcription backend + model. The backend names a provider module
# in worker/providers/; the model string is passed to it (its meaning is
# provider-specific). Defaults: Standard → Groq (Whisper large-v3-turbo, cheap,
# fast, ~99 languages); Premium → AssemblyAI (long-form accuracy).
#
# TRANSCRIBE_BACKEND, if set, overrides every tier — handy for running the whole
# stack on one backend (e.g. "local" for self-hosted faster-whisper, or "fake"
# for tests).
TRANSCRIBE_BACKEND = os.environ.get("TRANSCRIBE_BACKEND", "")

TIER_BACKENDS = {
    "standard": os.environ.get("STANDARD_BACKEND", "groq"),
    "premium": os.environ.get("PREMIUM_BACKEND", "assemblyai"),
}
TIER_MODELS = {
    "standard": os.environ.get("STANDARD_MODEL", "whisper-large-v3-turbo"),
    "premium": os.environ.get("PREMIUM_MODEL", "best"),
}

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

MAX_DURATION_SECONDS = int(os.environ.get("MAX_DURATION_SECONDS", str(4 * 3600)))
MAX_FILESIZE_BYTES = int(os.environ.get("MAX_FILESIZE_BYTES", str(2 * 1024**3)))
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "2"))
STALE_JOB_MINUTES = int(os.environ.get("STALE_JOB_MINUTES", "30"))
SSRF_ALLOW_PRIVATE = os.environ.get("SSRF_ALLOW_PRIVATE", "0") == "1"
