# faster-whisper needs CUDA 12 + cuDNN 9 (ctranslate2 >= 4.5)
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir runpod faster-whisper requests

# Bake the tier models into the image so cold starts don't re-download them.
# (Downloads CTranslate2 weights from Hugging Face at build time.)
ARG MODELS="small large-v3"
RUN python3 - <<'EOF'
import os
from faster_whisper import WhisperModel
for name in os.environ.get("MODELS", "small large-v3").split():
    print("downloading", name)
    WhisperModel(name, device="cpu", compute_type="int8")
EOF

COPY handler.py /handler.py
CMD ["python3", "-u", "/handler.py"]
