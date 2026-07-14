FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY worker ./worker

# ".[local]" bundles faster-whisper so the image also works with
# TRANSCRIBE_BACKEND=local; drop the extra for a slim RunPod-only worker.
RUN pip install --no-cache-dir ".[local]"

CMD ["transcribe-worker"]
