import os


def _repo_default(*parts: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "..", *parts))


DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/transcribe"
)

# Storage of user uploads (and, for the RunPod backend, normalized audio).
STORAGE_DRIVER = os.environ.get("STORAGE_DRIVER", "local")  # local | s3
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", _repo_default("data", "uploads"))
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_REGION = os.environ.get("S3_REGION", "auto")
S3_BUCKET = os.environ.get("S3_BUCKET", "transcribe")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY", "")
S3_FORCE_PATH_STYLE = os.environ.get("S3_FORCE_PATH_STYLE", "1") == "1"

TRANSCRIBE_BACKEND = os.environ.get("TRANSCRIBE_BACKEND", "local")  # local | runpod

# Tier -> Whisper model. Rates (credits/minute) live in the job row, written by
# the web app at submission time from web/src/lib/pricing.ts.
TIER_MODELS = {
    "standard": os.environ.get("WHISPER_MODEL_STANDARD", "small"),
    "premium": os.environ.get("WHISPER_MODEL_PREMIUM", "large-v3"),
}

WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "auto")

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "")
RUNPOD_TIMEOUT_SECONDS = int(os.environ.get("RUNPOD_TIMEOUT_SECONDS", "3600"))

MAX_DURATION_SECONDS = int(os.environ.get("MAX_DURATION_SECONDS", str(4 * 3600)))
MAX_FILESIZE_BYTES = int(os.environ.get("MAX_FILESIZE_BYTES", str(2 * 1024**3)))
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "2"))
STALE_JOB_MINUTES = int(os.environ.get("STALE_JOB_MINUTES", "30"))
SSRF_ALLOW_PRIVATE = os.environ.get("SSRF_ALLOW_PRIVATE", "0") == "1"
