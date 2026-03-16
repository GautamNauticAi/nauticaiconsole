# NautiCAI Backend API (auth, inspect, reports). Deploy to Cloud Run.
# Build: docker build -t nauticai-api .
# Run:   docker run -p 8000:8000 -e POSTGRES_DSN=... -e JWT_SECRET=... nauticai-api
# Cloud Run sets PORT; do not set NAUTICAI_START_TELEGRAM_BOT or TELEGRAM_BOT_TOKEN here.
FROM python:3.11-slim

WORKDIR /app

# Install system deps for OpenCV etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Ensure model files exist at runtime or set NAUTICAI_YOLO_PATH / NAUTICAI_SAM_PATH in Cloud Run.
# Place biofouling_best.pt and sam_checkpoints/sam_vit_b_01ec64.pth in build context if needed.

ENV PORT=8000
EXPOSE 8000

CMD uvicorn nauticai_api:app --host 0.0.0.0 --port ${PORT}
