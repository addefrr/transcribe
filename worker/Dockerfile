FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY worker ./worker

# Default install talks to the managed APIs (Groq/Soniox) — no heavy ML deps.
# For a self-hosted faster-whisper worker, build with:  pip install ".[local]"
RUN pip install --no-cache-dir .

CMD ["transcribe-worker"]
