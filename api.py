"""
NautiCAI FastAPI Backend
Runs YOLOv8 inference on uploaded images/videos and stores results in Postgres (Neon).
Start with: uvicorn api:app --reload --port 8000
"""

import os
import io
import uuid
import time
import random
import base64
import tempfile
import cv2
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

# ── Torch safe loading fix — MUST run before ultralytics import ──
import torch

_orig_torch_load = torch.load
def _safe_load(*args, **kw):
    kw["weights_only"] = False
    return _orig_torch_load(*args, **kw)
torch.load = _safe_load

from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from ultralytics import YOLO
from dotenv import load_dotenv
import json
import hashlib
import secrets

# Optional direct Postgres access (Neon)
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except Exception:
    psycopg2 = None


# ── Config ──────────────────────────────────────────────
load_dotenv()
POSTGRES_DSN = os.getenv("POSTGRES_DSN") or os.getenv("DATABASE_URL")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "best.pt")

# Model training metrics (from FinalUI/app.py)
MODEL_METRICS = {
    "precision": 0.886,
    "recall":    0.844,
    "map50":     0.882,
    "map5095":   0.782,
}

# ── Pydantic model for contact form ──────────────────────
class ContactPayload(BaseModel):
    first_name: str
    last_name: str
    email: str
    company: str = ""
    use_case: str = ""
    message: str = ""


def insert_contact_postgres(payload) -> bool:
    """Stub — no Postgres configured. Returns False."""
    return False


# Class colour map for bounding boxes (BGR for OpenCV)
CLASS_COLORS_BGR = {
    "corrosion":      (60,  76,  231),   # red
    "marine growth":  (0,  165,  240),   # amber
    "debris":         (34, 126,  230),   # orange
    "healthy surface":(176, 200,  0),    # teal
    "healthy":        (176, 200,  0),
}
DEFAULT_COLOR_BGR = (0, 200, 176)

# ── App setup ────────────────────────────────────────────
app = FastAPI(title="NautiCAI Detection API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load model once at startup ────────────────────────────
print(f"Loading YOLO model from {MODEL_PATH} ...")
model = YOLO(MODEL_PATH)
print("Model loaded ✓")

# ── Helper: get box colour ────────────────────────────────
def get_color(class_name: str):
    key = class_name.lower().strip()
    return CLASS_COLORS_BGR.get(key, DEFAULT_COLOR_BGR)


# ── Helper: draw boxes on image (OpenCV) ─────────────────
def draw_boxes(image_bgr: np.ndarray, detections: list) -> np.ndarray:
    img = image_bgr.copy()
    H, W = img.shape[:2]

    for det in detections:
        x1, y1, x2, y2 = int(det["x1"]), int(det["y1"]), int(det["x2"]), int(det["y2"])
        label = det["class_name"]
        conf  = det["confidence"]
        color = get_color(label)

        # Bounding box
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

        # Corner markers (Anduril-style)
        cs = 12
        for (cx, cy, dx, dy) in [
            (x1, y1,  cs,  cs), (x2, y1, -cs,  cs),
            (x1, y2,  cs, -cs), (x2, y2, -cs, -cs),
        ]:
            cv2.line(img, (cx, cy), (cx + dx, cy), color, 3)
            cv2.line(img, (cx, cy), (cx, cy + dy), color, 3)

        # Label background + text
        tag = f"{label}  {conf:.0%}"
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale, thick = 0.48, 1
        (tw, th), _ = cv2.getTextSize(tag, font, scale, thick)
        lx, ly = x1, max(y1 - 6, th + 4)
        cv2.rectangle(img, (lx, ly - th - 4), (lx + tw + 10, ly + 2), color, -1)
        cv2.putText(img, tag, (lx + 5, ly - 2), font, scale,
                    (10, 10, 10), thick, cv2.LINE_AA)

    # Detection count overlay
    count_label = f"{len(detections)} detection{'s' if len(detections) != 1 else ''} found"
    (cw, ch), _ = cv2.getTextSize(count_label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    cv2.rectangle(img, (W - cw - 20, H - ch - 16), (W - 4, H - 4), (6, 19, 32), -1)
    cv2.putText(img, count_label, (W - cw - 14, H - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 176), 1, cv2.LINE_AA)

    return img


# ── Helper: image → base64 data URI ──────────────────────
def img_to_b64(image_bgr: np.ndarray) -> str:
    success, buf = cv2.imencode(".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not success:
        raise RuntimeError("Failed to encode image")
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


# ── Contact form model & helpers ─────────────────────────────────────────────
class ContactPayload(BaseModel):
    first_name: str
    last_name: str
    email: str
    company: str
    use_case: str
    message: str | None = ""


def insert_contact_postgres(payload: ContactPayload) -> bool:
    if not POSTGRES_DSN or psycopg2 is None:
        return False
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO enterprise_contacts
                (first_name, last_name, email, company, use_case, message)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    payload.first_name,
                    payload.last_name,
                    payload.email,
                    payload.company,
                    payload.use_case,
                    payload.message,
                ),
            )
        conn.commit()
        return True
    except Exception as e:
        print(f"Postgres insert error: {e}")
        return False
    finally:
        if conn is not None:
            conn.close()


class AuthPayload(BaseModel):
    email: str
    password: str


def hash_password(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    digest = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return salt, digest


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    digest = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return secrets.compare_digest(digest, password_hash)


def create_session(user_id: int) -> str:
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(500, "Auth not configured")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO auth_sessions (user_id, token, created_at, expires_at)
                VALUES (%s, %s, NOW(), %s)
                """,
                (user_id, token, expires_at),
            )
        conn.commit()
        return token
    except Exception as e:
        print(f"Auth session insert error: {e}")
        raise HTTPException(500, "Failed to create auth session")
    finally:
        if conn is not None:
            conn.close()


def get_user_from_token(token: str) -> dict | None:
    if not POSTGRES_DSN or psycopg2 is None:
        return None
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.email
                FROM auth_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = %s
                  AND (s.expires_at IS NULL OR s.expires_at > NOW())
                """,
                (token,),
            )
            row = cur.fetchone()
        return row
    except Exception as e:
        print(f"Auth token lookup error: {e}")
        return None
    finally:
        if conn is not None:
            conn.close()


def require_auth(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(401, "Invalid or expired auth token")
    return user


def insert_inspection_postgres(row: dict) -> bool:
    """
    Persist an inspection summary into Postgres (Neon).
    Expects the `inspections` table to exist with matching columns.
    """
    if not POSTGRES_DSN or psycopg2 is None:
        return False

    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO inspections (
                  inspection_id,
                  file_name,
                  detected_classes,
                  highest_confidence,
                  risk_level,
                  inference_time,
                  precision,
                  recall,
                  map50,
                  map5095,
                  image_url,
                  annotated_image_url,
                  status,
                  created_at
                )
                VALUES (
                  %(inspection_id)s,
                  %(file_name)s,
                  %(detected_classes)s,
                  %(highest_confidence)s,
                  %(risk_level)s,
                  %(inference_time)s,
                  %(precision)s,
                  %(recall)s,
                  %(map50)s,
                  %(map5095)s,
                  %(image_url)s,
                  %(annotated_image_url)s,
                  %(status)s,
                  NOW()
                )
                """,
                row,
            )
        conn.commit()
        return True
    except Exception as e:
        print(f"Postgres inspection insert error: {e}")
        return False
    finally:
        if conn is not None:
            conn.close()


# ══════════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════
@app.post("/auth/signup")
async def auth_signup(payload: AuthPayload):
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(500, "Auth not configured")

    email = payload.email.strip().lower()
    if not email or not payload.password:
        raise HTTPException(400, "Email and password are required")

    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                raise HTTPException(400, "User already exists")

            salt, pw_hash = hash_password(payload.password)
            cur.execute(
                """
                INSERT INTO users (email, password_salt, password_hash, created_at)
                VALUES (%s, %s, %s, NOW())
                RETURNING id, email
                """,
                (email, salt, pw_hash),
            )
            user = cur.fetchone()
        conn.commit()
    finally:
        if conn is not None:
            conn.close()

    token = create_session(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"]}}


@app.post("/auth/login")
async def auth_login(payload: AuthPayload):
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(500, "Auth not configured")

    email = payload.email.strip().lower()
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, password_salt, password_hash
                FROM users
                WHERE email = %s
                """,
                (email,),
            )
            user = cur.fetchone()
        if not user or not verify_password(
            payload.password, user["password_salt"], user["password_hash"]
        ):
            raise HTTPException(401, "Invalid email or password")
    finally:
        if conn is not None:
            conn.close()

    token = create_session(user["id"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"]}}


# ══════════════════════════════════════════════════════════
#  ENDPOINT: POST /detect
# ══════════════════════════════════════════════════════════
@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):
    """
    Accept an image or video, run YOLOv8 inference, return detections.
    Response JSON:
      detections: [ { class_name, confidence, x1, y1, x2, y2 } ]
      annotated_image: base64 data URI (JPEG)
      summary: { total, risk_level, avg_confidence, inference_time_ms }
      inspection_id: str
      model_metrics: { precision, recall, map50, map5095 }
    """
    # Require auth
    require_auth(authorization)

    # Validate
    allowed = {"image/jpeg", "image/png", "image/jpg", "image/webp",
               "video/mp4", "video/quicktime", "video/avi"}
    if file.content_type and file.content_type not in allowed:
        raise HTTPException(415, f"Unsupported file type: {file.content_type}")

    raw_bytes = await file.read()
    is_video  = file.content_type and file.content_type.startswith("video/")

    # ── Run inference ─────────────────────────────────────
    t0 = time.time()

    with tempfile.NamedTemporaryFile(
        suffix=Path(file.filename or "upload.jpg").suffix,
        delete=False
    ) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        results = model.predict(
            source=tmp_path,
            conf=0.25,
            iou=0.45,
            save=False,
            verbose=False,
        )
    finally:
        os.unlink(tmp_path)

    inference_ms = round((time.time() - t0) * 1000, 1)

    # ── Parse detections ──────────────────────────────────
    # For video we take the first frame's result; for images just result[0]
    result = results[0]

    # Decode original image for drawing
    if is_video:
        nparr = np.frombuffer(raw_bytes, np.uint8)
        # try to get first frame
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as vf:
            vf.write(raw_bytes)
            vf_path = vf.name
        cap = cv2.VideoCapture(vf_path)
        ok, orig_frame = cap.read()
        cap.release()
        os.unlink(vf_path)
        if not ok:
            raise HTTPException(400, "Could not decode video frame")
        image_bgr = orig_frame
    else:
        nparr    = np.frombuffer(raw_bytes, np.uint8)
        image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    detections = []
    if result.boxes is not None and len(result.boxes) > 0:
        boxes       = result.boxes
        cls_ids     = boxes.cls.cpu().numpy().astype(int)
        confs       = boxes.conf.cpu().numpy()
        xyxy        = boxes.xyxy.cpu().numpy()

        for i in range(len(cls_ids)):
            class_name = result.names[cls_ids[i]]
            detections.append({
                "class_name":  class_name,
                "confidence":  float(round(confs[i], 4)),
                "x1": float(xyxy[i][0]),
                "y1": float(xyxy[i][1]),
                "x2": float(xyxy[i][2]),
                "y2": float(xyxy[i][3]),
            })

    # ── Draw annotated image ──────────────────────────────
    annotated_bgr = draw_boxes(image_bgr, detections)
    annotated_b64 = img_to_b64(annotated_bgr)

    # ── Risk level ────────────────────────────────────────
    if detections:
        max_conf = max(d["confidence"] for d in detections)
        if max_conf > 0.85:
            risk = "HIGH"
        elif max_conf > 0.60:
            risk = "MEDIUM"
        else:
            risk = "LOW"
        avg_conf = round(sum(d["confidence"] for d in detections) / len(detections), 4)
    else:
        max_conf = 0.0
        avg_conf = 0.0
        risk = "SAFE"

    inspection_id = f"NCR-{datetime.now().strftime('%Y%m%d')}-{random.randint(1000,9999)}"

    # ── Persist summary to Postgres (best-effort) ─────────
    try:
        class_names = list({d["class_name"] for d in detections})
        row = {
            "inspection_id":       inspection_id,
            "file_name":           file.filename,
            "detected_classes":    json.dumps(class_names),
            "highest_confidence":  float(max_conf),
            "risk_level":          risk,
            "inference_time":      inference_ms / 1000,
            "precision":           MODEL_METRICS["precision"],
            "recall":              MODEL_METRICS["recall"],
            "map50":               MODEL_METRICS["map50"],
            "map5095":             MODEL_METRICS["map5095"],
            "image_url":           None,
            "annotated_image_url": None,
            "status":              "completed",
        }
        insert_inspection_postgres(row)
    except Exception as e:
        print(f"Postgres inspection insert error: {e}")

    # ── Response ──────────────────────────────────────────
    return JSONResponse({
        "inspection_id":   inspection_id,
        "detections":      detections,
        "annotated_image": annotated_b64,
        "summary": {
            "total":              len(detections),
            "risk_level":         risk,
            "avg_confidence":     avg_conf,
            "max_confidence":     float(max_conf),
            "inference_time_ms":  inference_ms,
        },
        "model_metrics": MODEL_METRICS,
        "timestamp":      datetime.now().isoformat(),
    })


# ══════════════════════════════════════════════════════════
#  ENDPOINT: GET /inspections
# ══════════════════════════════════════════════════════════
@app.get("/inspections")
async def get_inspections(limit: int = 20, inspection_id: Optional[str] = None):
    """
    List inspections or fetch a specific inspection.
    Returns JSON with an `inspections` array.
    """
    if not POSTGRES_DSN or psycopg2 is None:
        return {"inspections": [], "error": "Postgres not configured"}

    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        with conn.cursor() as cur:
            if inspection_id:
                cur.execute(
                    """
                    SELECT
                      id,
                      inspection_id,
                      file_name,
                      detected_classes,
                      highest_confidence,
                      risk_level,
                      inference_time,
                      precision,
                      recall,
                      map50,
                      map5095,
                      image_url,
                      annotated_image_url,
                      status,
                      created_at
                    FROM inspections
                    WHERE inspection_id = %s
                    ORDER BY created_at DESC
                    """,
                    (inspection_id,),
                )
            else:
                cur.execute(
                    """
                    SELECT
                      id,
                      inspection_id,
                      file_name,
                      detected_classes,
                      highest_confidence,
                      risk_level,
                      inference_time,
                      precision,
                      recall,
                      map50,
                      map5095,
                      image_url,
                      annotated_image_url,
                      status,
                      created_at
                    FROM inspections
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = cur.fetchall()
        return {"inspections": rows}
    except Exception as e:
        print(f"Postgres inspections query error: {e}")
        return {"inspections": [], "error": str(e)}
    finally:
        if conn is not None:
            conn.close()


# ── Health check ──────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": MODEL_PATH,
        "postgres": bool(POSTGRES_DSN),
    }


# ── Debug: verify loaded module and routes ───────────────────────────────────
@app.get("/debug/routes")
async def debug_routes():
    return {
        "file": __file__,
        "routes": [r.path for r in app.router.routes],
    }


# ── ENDPOINT: POST /contact ──────────────────────────────────────────────────
@app.post("/contact")
async def submit_contact(payload: ContactPayload):
    """
    Save enterprise contact form data into Postgres (Neon).
    """
    postgres_ok = insert_contact_postgres(payload)

    if not postgres_ok:
        raise HTTPException(500, "Failed to save contact data")

    return {
        "status": "ok",
        "saved_postgres": postgres_ok,
    }
