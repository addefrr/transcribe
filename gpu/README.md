# GPU transcription endpoint (RunPod Serverless)

This directory builds the Docker image that actually runs Whisper on rented
GPUs. The worker talks to it through RunPod's Serverless API, so you pay only
for seconds of GPU time while a job is transcribing — the cheapest way to run
high-accuracy Whisper at low/bursty volume.

## Deploy

1. Build & push the image (any registry RunPod can pull from):

   ```sh
   docker build -t <you>/transcribe-gpu:latest .
   docker push <you>/transcribe-gpu:latest
   ```

2. In the [RunPod console](https://www.runpod.io/console/serverless) create a
   **Serverless Endpoint**:
   - Container image: `<you>/transcribe-gpu:latest`
   - GPU: 24 GB (e.g. RTX 4090 / L4) is plenty for `large-v3`
   - Min workers 0 (scale to zero), max as you like
   - Enable FlashBoot for faster cold starts

3. Point the worker at it via env:

   ```sh
   TRANSCRIBE_BACKEND=runpod
   RUNPOD_API_KEY=...        # runpod.io → Settings → API Keys
   RUNPOD_ENDPOINT_ID=...    # from the endpoint page
   STORAGE_DRIVER=s3         # audio is handed to the GPU via presigned S3 URLs
   ```

## Notes

- The `Dockerfile` bakes the `small` and `large-v3` models into the image
  (override with `--build-arg MODELS="..."`), so cold workers don't pull
  weights from Hugging Face.
- The handler only accepts models in its allow-list; extend `ALLOWED_MODELS`
  in `handler.py` if you add tiers.
- Rough economics: an RTX 4090 serverless worker (~$0.00031/s) transcribes
  with `large-v3` at ~10–20× realtime → well under $0.15 per audio-hour.
