FROM python:3.11-slim

# Install system deps for OpenCV / video handling
RUN apt-get update \ 
 && apt-get install -y --no-install-recommends ffmpeg libsm6 libxext6 \ 
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements_api.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Required at runtime: api.py, best.pt (model). Build: requirements_api.txt.
COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 8080

# Cloud Run sets PORT=8080; must listen on that port (use shell so $PORT is expanded)
CMD ["/bin/sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8080}"]

