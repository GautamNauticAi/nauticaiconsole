# NautiCAI Backend API (auth, inspect, reports). Deploy to Cloud Run.
# Build: docker build -t nauticai-api .
# Run:   docker run -p 8000:8000 -e POSTGRES_DSN=... -e JWT_SECRET=... nauticai-api
# Cloud Run sets PORT; do not set NAUTICAI_START_TELEGRAM_BOT or TELEGRAM_BOT_TOKEN here.
FROM python:3.11-slim

WORKDIR /app

# Install system deps: OpenCV (libgl1), git (pip clone), curl (download SAM)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download SAM checkpoint (public URL); avoids committing large .pth to repo.
RUN mkdir -p sam_checkpoints \
    && curl -L -o sam_checkpoints/sam_vit_b_01ec64.pth \
       "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth"

COPY . .
# YOLO: ensure biofouling_best.pt is in build context or set NAUTICAI_YOLO_PATH at runtime.

ENV PORT=8000
EXPOSE 8000

CMD uvicorn nauticai_api:app --host 0.0.0.0 --port ${PORT}
