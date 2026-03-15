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

# For ResNet species model (optional)
try:
    from torchvision import transforms
    _HAS_TORCHVISION = True
except Exception:
    _HAS_TORCHVISION = False

from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import jwt as pyjwt
import httpx

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
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
# Brevo SMTP (preferred when set): smtp-relay.brevo.com:587, TLS. User = SMTP login email from Brevo; password = SMTP key.
BREVO_SMTP_USER = (os.getenv("BREVO_SMTP_USER") or "").strip() or None
BREVO_SMTP_KEY = (os.getenv("BREVO_SMTP_KEY") or "").strip() or None
BREVO_SMTP_HOST = os.getenv("BREVO_SMTP_HOST", "smtp-relay.brevo.com")
BREVO_SMTP_PORT = int(os.getenv("BREVO_SMTP_PORT", "587"))
RESET_SECRET = os.getenv("RESET_SECRET") or os.getenv("JWT_SECRET") or "change-me-in-production"
FRONTEND_URL = os.getenv("FRONTEND_URL") or "https://nauticai-frontend.vercel.app"
# Set NAUTICAI_SKIP_AUTH=1 to allow /detect without token (local model testing when DB is unreachable)
SKIP_AUTH = os.getenv("NAUTICAI_SKIP_AUTH", "").strip().lower() in ("1", "true", "yes")

# Model: use NAUTICAI_MODEL_PATH if set (e.g. to Prasad's updated best.pt), else default best.pt
_MODEL_DIR = os.path.dirname(__file__)
MODEL_PATH = os.getenv("NAUTICAI_MODEL_PATH") or os.path.join(_MODEL_DIR, "best.pt")
if not os.path.isabs(MODEL_PATH):
    MODEL_PATH = os.path.join(_MODEL_DIR, MODEL_PATH)

# Model training metrics — override via env NAUTICAI_MODEL_METRICS="precision,recall,map50,map5095" (comma-separated)
_DEFAULT_METRICS = {"precision": 0.886, "recall": 0.844, "map50": 0.882, "map5095": 0.782}
_metrics_env = os.getenv("NAUTICAI_MODEL_METRICS")
if _metrics_env:
    try:
        parts = [float(x.strip()) for x in _metrics_env.split(",")]
        if len(parts) == 4:
            MODEL_METRICS = {"precision": parts[0], "recall": parts[1], "map50": parts[2], "map5095": parts[3]}
        else:
            MODEL_METRICS = _DEFAULT_METRICS.copy()
    except Exception:
        MODEL_METRICS = _DEFAULT_METRICS.copy()
else:
    MODEL_METRICS = _DEFAULT_METRICS.copy()

# Species classification model (runs on biofouling crops after best.pt)
SPECIES_MODEL_PATH = os.getenv("NAUTICAI_SPECIES_MODEL_PATH") or os.path.join(_MODEL_DIR, "species.pt")
if not os.path.isabs(SPECIES_MODEL_PATH):
    SPECIES_MODEL_PATH = os.path.join(_MODEL_DIR, SPECIES_MODEL_PATH)
# Real species class names (order = model index: 0, 1, 2, ...). Set in .env to replace "class_0", "class_1", etc.
# Example: NAUTICAI_SPECIES_CLASSES=ALGAE,BARNACLES,TUBEWORMS,OTHER
_env_species = os.getenv("NAUTICAI_SPECIES_CLASSES", "").strip()
SPECIES_CLASS_NAMES = [s.strip() for s in _env_species.split(",") if s.strip()] if _env_species else []
# Detection class names that trigger species classification (lowercase)
BIOFOULING_CLASS_NAMES = {"biofouling", "marine growth", "marine_growth"}

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
    "biofouling":     (0,  165,  240),   # amber (same as marine growth)
    "debris":         (34, 126,  230),   # orange
    "healthy surface":(176, 200,  0),    # teal
    "healthy":        (176, 200,  0),
}
DEFAULT_COLOR_BGR = (0, 200, 176)

# ── App setup ────────────────────────────────────────────
app = FastAPI(title="NautiCAI Detection API", version="1.0")

# CORS: production origin + any localhost in dev (so both prod and dev work)
_app_origins = [
    "https://nauticai-frontend.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_app_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allow_headers=["*", "Authorization", "Content-Type"],
    expose_headers=["*"],
)

# ── Lazy-load models (so Cloud Run startup probe passes before model loads) ──
_model = None
_species_model = None

def get_model():
    global _model
    if _model is None:
        print(f"Loading YOLO model from {MODEL_PATH} ...")
        _model = YOLO(MODEL_PATH)
        print("Model loaded ✓")
    return _model

def _load_resnet_species():
    """Load species.pt as a PyTorch ResNet (or other nn.Module) checkpoint. Returns None on failure."""
    if not _HAS_TORCHVISION:
        return None
    try:
        ckpt = _orig_torch_load(SPECIES_MODEL_PATH, map_location="cpu", weights_only=False)
        model = None
        class_names = None
        if isinstance(ckpt, dict):
            model = ckpt.get("model")  # full nn.Module if saved that way
            class_names = ckpt.get("class_names") or ckpt.get("classes") or ckpt.get("class_names_list")
            if model is None and "state_dict" in ckpt:
                state_dict = ckpt["state_dict"]
                num_classes = ckpt.get("num_classes")
                if num_classes is None and class_names is not None:
                    num_classes = len(class_names)
                if num_classes is None:
                    for k, v in state_dict.items():
                        if "fc" in k or "classifier" in k:
                            if hasattr(v, "shape") and len(v.shape) >= 1:
                                num_classes = v.shape[0]
                                break
                if num_classes is not None:
                    try:
                        from torchvision.models import resnet50
                        model = resnet50(num_classes=num_classes)
                        model.load_state_dict(state_dict, strict=False)
                    except Exception:
                        pass
        elif hasattr(ckpt, "eval") and callable(getattr(ckpt, "forward", None)):
            model = ckpt
        if model is None:
            return None
        model.eval()
        if class_names is None or (isinstance(class_names, (list, tuple)) and len(class_names) == 0):
            num_classes = (
                getattr(model, "num_classes", None)
                or (getattr(model.fc, "out_features", None) if hasattr(model, "fc") else None)
                or (getattr(model.classifier, "out_features", None) if hasattr(model, "classifier") else None)
            )
            if num_classes is None:
                for _name, mod in model.named_modules():
                    if "Linear" in type(mod).__name__ and hasattr(mod, "out_features"):
                        num_classes = mod.out_features
                        break
            if num_classes is not None:
                class_names = [f"class_{i}" for i in range(num_classes)]
            else:
                class_names = ["ALGAE", "BARNACLES", "TUBEWORMS", "OTHER"]
        if isinstance(class_names, dict):
            class_names = [class_names.get(i, f"class_{i}") for i in range(max(class_names.keys()) + 1)]
        class_names = list(class_names)
        # Override with env names if provided (use first N env names for N model classes)
        if SPECIES_CLASS_NAMES:
            n = len(class_names)
            class_names = [SPECIES_CLASS_NAMES[i] if i < len(SPECIES_CLASS_NAMES) else f"class_{i}" for i in range(n)]
        return {"type": "resnet", "model": model, "class_names": class_names}
    except Exception as e:
        print(f"ResNet species load failed: {e}")
        return None


def get_species_model():
    """Lazy-load species classifier (YOLO or ResNet). Returns None if species.pt is missing or unloadable."""
    global _species_model
    if _species_model is not None:
        return _species_model
    if not os.path.isfile(SPECIES_MODEL_PATH):
        print(f"Species model not found at {SPECIES_MODEL_PATH}, skipping species classification.")
        return None
    try:
        print(f"Loading species model from {SPECIES_MODEL_PATH} ...")
        _species_model = YOLO(SPECIES_MODEL_PATH)
        print("Species model loaded (YOLO) ✓")
        return _species_model
    except Exception as e1:
        print(f"YOLO load failed (trying ResNet): {e1}")
        resnet_wrapper = _load_resnet_species()
        if resnet_wrapper is not None:
            _species_model = resnet_wrapper
            print("Species model loaded (ResNet) ✓")
            return _species_model
        print("Species model failed to load. Skipping species classification.")
        _species_model = None
        return None

# ── Helper: get box colour ────────────────────────────────
def get_color(class_name: str):
    key = class_name.lower().strip()
    return CLASS_COLORS_BGR.get(key, DEFAULT_COLOR_BGR)


def _run_resnet_species(crop_bgr: np.ndarray, wrapper: dict) -> list:
    """Run ResNet species classifier on a BGR crop. Returns list of { class_name, confidence }."""
    model = wrapper["model"]
    class_names = wrapper["class_names"]
    if not class_names:
        return []
    try:
        # BGR -> RGB, resize 224x224, ImageNet normalize
        crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        crop_rgb = cv2.resize(crop_rgb, (224, 224), interpolation=cv2.INTER_LINEAR)
        x = torch.from_numpy(crop_rgb).float().div(255.0).permute(2, 0, 1).unsqueeze(0)
        mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
        x = (x - mean) / std
        with torch.no_grad():
            logits = model(x)
        if hasattr(logits, "logits"):
            logits = logits.logits
        probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()
        out = []
        for idx in np.argsort(probs)[::-1][:5]:
            if probs[idx] < 0.1:
                break
            name = class_names[idx] if idx < len(class_names) else f"class_{idx}"
            out.append({"class_name": name, "confidence": float(round(probs[idx], 4))})
        return out
    except Exception as e:
        print(f"ResNet species inference error: {e}")
        return []


def _run_species_on_crop(image_bgr: np.ndarray, x1: int, y1: int, x2: int, y2: int, padding: int = 8) -> list:
    """Run species model on a cropped region. Returns list of { class_name, confidence }."""
    model = get_species_model()
    if model is None:
        return []
    H, W = image_bgr.shape[:2]
    x1p = max(0, x1 - padding)
    y1p = max(0, y1 - padding)
    x2p = min(W, x2 + padding)
    y2p = min(H, y2 + padding)
    crop = image_bgr[y1p:y2p, x1p:x2p]
    if crop.size == 0:
        return []

    # ResNet path (Prasad's species.pt)
    if isinstance(model, dict) and model.get("type") == "resnet":
        try:
            return _run_resnet_species(crop, model)
        except Exception as e:
            print(f"Species inference error: {e}")
            return []

    # YOLO path
    try:
        results = model.predict(crop, conf=0.2, verbose=False)
        r = results[0]
        out = []
        if r.boxes is not None and len(r.boxes) > 0:
            cls_ids = r.boxes.cls.cpu().numpy().astype(int)
            confs = r.boxes.conf.cpu().numpy()
            for i in range(len(cls_ids)):
                name = r.names[int(cls_ids[i])]
                out.append({"class_name": name, "confidence": float(round(confs[i], 4))})
        elif getattr(r, "probs", None) is not None:
            probs = r.probs
            names = getattr(r, "names", None) or {}
            if hasattr(probs, "data"):
                data = probs.data.cpu().numpy()
                for idx in np.argsort(data)[::-1][:5]:
                    if data[idx] < 0.1:
                        break
                    name = names.get(int(idx), f"class_{idx}")
                    out.append({"class_name": name, "confidence": float(round(data[idx], 4))})
            elif hasattr(probs, "top1") and hasattr(probs, "top1conf"):
                out.append({
                    "class_name": names.get(int(probs.top1), f"class_{probs.top1}"),
                    "confidence": float(round(probs.top1conf.item(), 4)),
                })
        seen = {}
        for s in out:
            k = s["class_name"].lower()
            if k not in seen or s["confidence"] > seen[k]["confidence"]:
                seen[k] = s
        return list(seen.values())[:5]
    except Exception as e:
        print(f"Species inference error: {e}")
        return []


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

        # Label: main class + optional species
        tag = f"{label}  {conf:.0%}"
        species = det.get("species") or []
        if species:
            species_str = ", ".join(s["class_name"] for s in species[:3])
            if len(species) > 3:
                species_str += "..."
            tag += "  |  " + species_str
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


class ForgotPayload(BaseModel):
    email: str


class ResetPayload(BaseModel):
    token: str
    new_password: str


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


def create_reset_token(user_id: int) -> str:
    return pyjwt.encode(
        {"sub": user_id, "exp": datetime.utcnow() + timedelta(hours=1), "type": "password_reset"},
        RESET_SECRET,
        algorithm="HS256",
    )


def verify_reset_token(token: str) -> int | None:
    try:
        payload = pyjwt.decode(token, RESET_SECRET, algorithms=["HS256"])
        if payload.get("type") != "password_reset":
            return None
        return int(payload.get("sub", 0))
    except Exception:
        return None


def send_brevo_email(to_email: str, subject: str, html_content: str) -> bool:
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "noreply@nauticai.com")
    sender_name = os.getenv("BREVO_SENDER_NAME", "NautiCAI")

    # Prefer SMTP if credentials are set
    if BREVO_SMTP_USER and BREVO_SMTP_KEY:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{sender_name} <{sender_email}>"
            msg["To"] = to_email
            msg.attach(MIMEText(html_content, "html"))
            with smtplib.SMTP(BREVO_SMTP_HOST, BREVO_SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(BREVO_SMTP_USER, BREVO_SMTP_KEY)
                server.sendmail(sender_email, [to_email], msg.as_string())
            return True
        except Exception as e:
            print(f"Brevo SMTP send exception: {e}")
            return False

    if not BREVO_API_KEY:
        print("BREVO_API_KEY and BREVO_SMTP_* not set; skipping email send")
        return False
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
                json={
                    "sender": {"email": sender_email, "name": sender_name},
                    "to": [{"email": to_email}],
                    "subject": subject,
                    "htmlContent": html_content,
                },
            )
            if r.status_code not in (200, 201):
                print(f"Brevo send error: {r.status_code} {r.text}")
                return False
        return True
    except Exception as e:
        print(f"Brevo send exception: {e}")
        return False


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
    try:
        if not POSTGRES_DSN or psycopg2 is None:
            raise HTTPException(500, "Auth not configured")

        email = (payload.email or "").strip().lower()
        if not email or not (payload.password or ""):
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
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth signup error: {e}")
        raise HTTPException(500, "Sign up failed. Please try again.")


@app.post("/auth/login")
async def auth_login(payload: AuthPayload):
    try:
        if not POSTGRES_DSN or psycopg2 is None:
            raise HTTPException(500, "Auth not configured")

        email = (payload.email or "").strip().lower()
        if not email or not (payload.password or ""):
            raise HTTPException(400, "Email and password are required")

        conn = None
        user = None
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
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth login error: {e}")
        raise HTTPException(500, "Sign in failed. Please try again.")


@app.post("/auth/forgot-password")
async def auth_forgot_password(payload: ForgotPayload):
    """Send password reset email via Brevo. Always returns 200 to avoid email enumeration."""
    email = (payload.email or "").strip().lower()
    if not email:
        return {"ok": True}

    if not POSTGRES_DSN or psycopg2 is None:
        return {"ok": True}

    conn = None
    user_id = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            if row:
                user_id = row["id"]
    finally:
        if conn is not None:
            conn.close()

    if user_id and BREVO_API_KEY:
        reset_token = create_reset_token(user_id)
        reset_url = f"{FRONTEND_URL.rstrip('/')}/reset-password?token={reset_token}"
        html = f"""
        <p>You requested a password reset for NautiCAI.</p>
        <p><a href="{reset_url}" style="color:#7c3aed;">Reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p>— NautiCAI</p>
        """
        send_brevo_email(email, "Reset your NautiCAI password", html)

    return {"ok": True}


@app.post("/auth/reset-password")
async def auth_reset_password(payload: ResetPayload):
    """Reset password using token from email link."""
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(500, "Auth not configured")

    token = (payload.token or "").strip()
    new_password = (payload.new_password or "").strip()
    if not token or not new_password:
        raise HTTPException(400, "Token and new password are required")
    if len(new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user_id = verify_reset_token(token)
    if not user_id:
        raise HTTPException(400, "Invalid or expired reset link")

    salt, pw_hash = hash_password(new_password)
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_salt = %s, password_hash = %s WHERE id = %s",
                (salt, pw_hash, user_id),
            )
        conn.commit()
    except Exception as e:
        print(f"Reset password error: {e}")
        raise HTTPException(500, "Failed to update password")
    finally:
        if conn is not None:
            conn.close()

    return {"ok": True}


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
    # Require auth (unless NAUTICAI_SKIP_AUTH=1 for local model testing when DB is down)
    if not SKIP_AUTH:
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
        results = get_model().predict(
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

    # ── Species classification on biofouling crops (pipeline stage 2) ──
    for det in detections:
        if det["class_name"].lower().strip() in BIOFOULING_CLASS_NAMES:
            species_list = _run_species_on_crop(
                image_bgr,
                int(det["x1"]), int(det["y1"]), int(det["x2"]), int(det["y2"]),
            )
            det["species"] = species_list
        else:
            det["species"] = []

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
        "file_name":       file.filename,
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


# ══════════════════════════════════════════════════════════
#  ENDPOINT: DELETE /inspections/{id}
# ══════════════════════════════════════════════════════════
@app.delete("/inspections/{inspection_db_id}")
async def delete_inspection(inspection_db_id: str):
    """Delete an inspection by its database id (primary key)."""
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(500, "Database not configured")
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM inspections WHERE id = %s", (inspection_db_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Inspection not found")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete inspection error: {e}")
        raise HTTPException(500, "Failed to delete inspection")
    finally:
        if conn is not None:
            conn.close()


# ── Health check ──────────────────────────────────────────
@app.get("/health")
async def health():
    """Includes a real DB ping when POSTGRES_DSN is set so you can verify Neon from the API."""
    out = {"status": "ok", "model": MODEL_PATH, "postgres_configured": bool(POSTGRES_DSN)}
    if POSTGRES_DSN and psycopg2:
        conn = None
        try:
            conn = psycopg2.connect(POSTGRES_DSN, connect_timeout=5)
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            out["postgres"] = "ok"
        except Exception as e:
            out["postgres"] = "error"
            out["postgres_error"] = str(e)
        finally:
            if conn is not None:
                conn.close()
    else:
        out["postgres"] = "not_configured"
    return out


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
