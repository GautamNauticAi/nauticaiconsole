# NautiCAI Backend API (auth, inspect, reports). Deploy to Cloud Run.
# Build: docker build -t nauticai-api .
# Run:   docker run -p 8000:8000 -e POSTGRES_DSN=... -e JWT_SECRET=... nauticai-api
# Cloud Run sets PORT; do not set NAUTICAI_START_TELEGRAM_BOT or TELEGRAM_BOT_TOKEN here.
#
# Model weights: private GCS bucket + download_models.sh (Cloud Run SA = storage.objectViewer).
# To update models: upload new files to GCS, rebuild & redeploy.
FROM python:3.11-slim

WORKDIR /app

# Install system deps: OpenCV (libgl1), git (pip clone), curl (download SAM), gsutil deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download SAM checkpoint (public URL)
RUN mkdir -p sam_checkpoints \
    && curl -L -o sam_checkpoints/sam_vit_b_01ec64.pth \
       "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth"

COPY . .

# Download model weights from GCS at startup (set GCS_MODEL_BUCKET env var).
# Fallback: if models already exist in image (e.g. COPY from build context), skip download.
COPY download_models.sh .
RUN chmod +x download_models.sh

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "./download_models.sh && uvicorn nauticai_api:app --host 0.0.0.0 --port ${PORT}"]
