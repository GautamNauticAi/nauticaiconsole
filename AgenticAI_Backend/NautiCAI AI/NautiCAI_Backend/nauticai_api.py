# NautiCAI API - paste your complete code below
# ==========================================
# NautiCAI Backend API Server
# Version: 1.0.0
# Description: FastAPI server that exposes
# the NautiCAI Multi-Agent pipeline as REST
# API endpoints for the UI Dashboard.
# ==========================================

from __future__ import annotations

import os
import sys

# Jetson L4T: CUDA libs must be on LD_LIBRARY_PATH *before* torch is imported (via hull_inspection).
def _prepend_ld_library_path(dirpath: str) -> None:
    if not dirpath or not os.path.isdir(dirpath):
        return
    cur = os.environ.get("LD_LIBRARY_PATH", "")
    parts = cur.split(":") if cur else []
    if dirpath in parts:
        return
    os.environ["LD_LIBRARY_PATH"] = f"{dirpath}:{cur}" if cur else dirpath


if sys.platform.startswith("linux"):
    for _p in (
        "/usr/lib/aarch64-linux-gnu/tegra",
        "/usr/lib/aarch64-linux-gnu/tegra-egl",
        "/usr/local/cuda/lib64",
    ):
        _prepend_ld_library_path(_p)

import json
import shutil
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Tuple
from fpdf import FPDF
import uvicorn
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass
try:
    import jwt as pyjwt
except ImportError:
    pyjwt = None
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Header
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add vision pipeline to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nauticai_hull_inspection as vision_pipeline
try:
    import telegram_notify
except ImportError:
    telegram_notify = None

# Optional Neon DB for Telegram bot user validation and auth (signup/login)
POSTGRES_DSN = (os.environ.get("POSTGRES_DSN") or os.environ.get("DATABASE_URL") or "").strip()

# In-memory cache for GET /api/vessels/all (per user, short TTL to reduce DB + file reads)
VESSELS_CACHE_TTL_SEC = 45
_vessels_cache: dict[int, tuple[float, dict]] = {}  # uid -> (expiry_ts, {"vessels": [...]})
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None

# Auth: Brevo SMTP and password reset
BREVO_SMTP_USER = (os.environ.get("BREVO_SMTP_USER") or "").strip() or None
BREVO_SMTP_KEY = (os.environ.get("BREVO_SMTP_KEY") or "").strip() or None
BREVO_SMTP_HOST = os.environ.get("BREVO_SMTP_HOST", "smtp-relay.brevo.com")
BREVO_SMTP_PORT = int(os.environ.get("BREVO_SMTP_PORT", "587"))
RESET_SECRET = os.environ.get("RESET_SECRET") or os.environ.get("JWT_SECRET") or "change-me-in-production"
FRONTEND_URL = os.environ.get("FRONTEND_URL") or "http://localhost:3000"

# ==========================================
# AUTH HELPERS (signup / login / sessions)
# ==========================================
class AuthPayload(BaseModel):
    email: str
    password: str
    username: Optional[str] = None  # required at signup; ignored at login

class ForgotPayload(BaseModel):
    email: str

class ResetPayload(BaseModel):
    token: str
    new_password: str

def _hash_password(password: str) -> Tuple[str, str]:
    salt = secrets.token_hex(16)
    digest = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return salt, digest

def _verify_password(password: str, salt: str, password_hash: str) -> bool:
    digest = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return secrets.compare_digest(digest, password_hash)

def _create_session(user_id: int) -> str:
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(status_code=500, detail="Auth not configured")
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO auth_sessions (user_id, token, created_at, expires_at) VALUES (%s, %s, NOW(), %s)",
                (user_id, token, expires_at),
            )
        conn.commit()
        return token
    except Exception as e:
        print(f"Auth session insert error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create auth session")
    finally:
        if conn is not None:
            conn.close()

def _get_user_from_token(token: str) -> Optional[dict]:
    if not POSTGRES_DSN or psycopg2 is None:
        return None
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.email, u.telegram_user_id, u.username
                FROM auth_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = %s AND (s.expires_at IS NULL OR s.expires_at > NOW())
                """,
                (token,),
            )
            return cur.fetchone()
    except Exception as e:
        print(f"Auth token lookup error: {e}")
        return None
    finally:
        if conn is not None:
            conn.close()

def _require_auth(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    user = _get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired auth token")
    return user

def _create_reset_token(user_id: int) -> str:
    if not pyjwt:
        raise HTTPException(status_code=500, detail="JWT not installed")
    return pyjwt.encode(
        {"sub": user_id, "exp": datetime.utcnow() + timedelta(hours=1), "type": "password_reset"},
        RESET_SECRET,
        algorithm="HS256",
    )

def _verify_reset_token(token: str) -> Optional[int]:
    if not pyjwt:
        return None
    try:
        payload = pyjwt.decode(token, RESET_SECRET, algorithms=["HS256"])
        if payload.get("type") != "password_reset":
            return None
        return int(payload.get("sub", 0))
    except Exception:
        return None

def _reports_folder(user_id: int) -> str:
    """Per-user reports directory so each user only sees their own inspections."""
    folder = os.path.join("reports", str(user_id))
    os.makedirs(folder, exist_ok=True)
    return folder


def _sanitize_vessel_id(raw: str) -> str:
    """Filesystem-safe vessel id: spaces -> underscores, strip invalid chars. Same id for storage and API response."""
    if not raw or not raw.strip():
        return f"vessel_{int(datetime.now().timestamp() * 1000)}"
    s = raw.strip()
    s = "_".join(s.split())  # collapse spaces to single underscore
    s = "".join(c for c in s if c.isalnum() or c in "_-").strip("_") or "vessel"
    return s[:200]  # cap length

def _send_brevo_email(to_email: str, subject: str, html_content: str) -> bool:
    sender_email = os.environ.get("BREVO_SENDER_EMAIL", "noreply@nauticai.com")
    sender_name = os.environ.get("BREVO_SENDER_NAME", "NautiCAI")
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
    return False

# ==========================================
# INITIALIZE FASTAPI APP
# ==========================================
app = FastAPI(
    title="NautiCAI Backend API",
    description="Automated Maritime Hull Inspection System",
    version="1.0.0"
)

# Allow Gautam's UI to connect from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# LOAD AI MODELS ON STARTUP
# ==========================================
@app.on_event("startup")
async def load_models():
    print("[NautiCAI] Loading AI models...")
    vision_pipeline.load_models(
        yolo_path=os.path.join(
            os.path.dirname(__file__),
            "biofouling_best.pt"
        ),
        sam_path=os.path.join(
            os.path.dirname(__file__),
            "sam_checkpoints",
            "sam_vit_b_01ec64.pth"
        )
    )
    print("[NautiCAI] AI models loaded successfully!")

# ==========================================
# IMO BUSINESS LOGIC
# ==========================================
def calculate_imo_rating(coverage_percent):
    if coverage_percent == 0:
        return "FR-0 (Clean)", "No action required.", False
    elif coverage_percent < 5:
        return "FR-2 (Light Macrofouling)", "Monitor vessel condition regularly.", False
    elif 5 <= coverage_percent <= 20:
        return "FR-3 (Medium Macrofouling)", "ACTION REQUIRED: Schedule cleaning soon.", True
    else:
        return "FR-4 (Heavy Macrofouling - Critical!)", "URGENT: Immediate dry-dock cleaning required!", True

# ==========================================
# PDF GENERATOR (FPDF uses Latin-1; sanitize Unicode to avoid encode errors)
# ==========================================
def _pdf_safe(s):
    """Replace Unicode chars that FPDF/Latin-1 cannot encode (e.g. em dash)."""
    if s is None:
        return ""
    s = str(s)
    s = s.replace("\u2014", "-")   # em dash
    s = s.replace("\u2013", "-")   # en dash
    s = s.replace("\u2018", "'")   # left single quote
    s = s.replace("\u2019", "'")   # right single quote
    s = s.replace("\u201c", '"')   # left double quote
    s = s.replace("\u201d", '"')   # right double quote
    return "".join(c for c in s if ord(c) < 256)


class NautiCAIPDF(FPDF):
    def header(self):
        self.set_fill_color(0, 31, 63)
        self.rect(0, 0, 210, 40, 'F')
        self.set_font('Arial', 'B', 24)
        self.set_text_color(255, 255, 255)
        self.set_xy(10, 8)
        self.cell(0, 10, 'NautiCAI', 0, 1, 'L')
        self.set_font('Arial', 'I', 11)
        self.set_text_color(100, 200, 255)
        self.set_xy(10, 20)
        self.cell(0, 8, 'Professional Maritime Hull Inspection Service', 0, 1, 'L')
        self.set_font('Arial', 'B', 11)
        self.set_text_color(255, 255, 255)
        self.set_xy(120, 14)
        self.cell(80, 8, 'OFFICIAL HULL INSPECTION REPORT', 0, 1, 'R')
        self.set_fill_color(0, 188, 188)
        self.rect(0, 40, 210, 2, 'F')
        self.ln(20)

    def footer(self):
        self.set_y(-20)
        self.set_fill_color(0, 31, 63)
        self.rect(0, 277, 210, 20, 'F')
        self.set_font('Arial', 'I', 8)
        self.set_text_color(200, 200, 200)
        self.set_xy(10, 280)
        self.cell(0, 8,
            'NautiCAI Hull Inspection Services | '
            'IMO Biofouling Guidelines Compliant | '
            f'Page {self.page_no()}',
            0, 0, 'C')

    def section_title(self, title):
        self.set_fill_color(0, 51, 102)
        self.set_text_color(255, 255, 255)
        self.set_font('Arial', 'B', 12)
        self.cell(0, 10, _pdf_safe(f'  {title}'), 0, 1, 'L', fill=True)
        self.ln(3)

    def info_row(self, label, value, highlight=False):
        if highlight:
            self.set_fill_color(240, 248, 255)
        else:
            self.set_fill_color(255, 255, 255)
        self.set_text_color(80, 80, 80)
        self.set_font('Arial', 'B', 11)
        self.cell(80, 9, _pdf_safe(f'  {label}:'), 0, 0, 'L', fill=True)
        self.set_text_color(0, 0, 0)
        self.set_font('Arial', '', 11)
        self.cell(110, 9, _pdf_safe(value), 0, 1, 'L', fill=True)
        self.set_draw_color(220, 220, 220)
        self.line(10, self.get_y(), 200, self.get_y())

    def rating_badge(self, rating, requires_cleaning):
        self.ln(5)
        if requires_cleaning:
            self.set_fill_color(220, 20, 60)
            status_text = "!! IMMEDIATE CLEANING REQUIRED !!"
            status_color = (220, 20, 60)
        else:
            self.set_fill_color(34, 139, 34)
            status_text = "VESSEL CONDITION IS ACCEPTABLE"
            status_color = (34, 139, 34)
        self.set_text_color(255, 255, 255)
        self.set_font('Arial', 'B', 18)
        self.cell(0, 16, _pdf_safe(f'  {rating}  '), 0, 1, 'C', fill=True)
        self.set_font('Arial', 'B', 13)
        self.set_text_color(*status_color)
        self.cell(0, 10, _pdf_safe(status_text), 0, 1, 'C')
        self.ln(5)

def create_pdf(vessel_id, report_payload, output_folder, annotated_path=None):
    """Generate single-image report PDF. If annotated_path is provided and exists, embed it on a new page."""
    timestamp   = report_payload["metadata"]["inspection_timestamp"]
    coverage    = report_payload["ai_vision_metrics"]["total_hull_coverage_percentage"]
    severity    = report_payload["ai_vision_metrics"]["severity"]
    detections  = report_payload["ai_vision_metrics"]["total_detections"]
    rating      = report_payload["compliance_result"]["official_imo_rating"]
    action      = report_payload["compliance_result"]["recommended_action"]
    requires_cleaning = report_payload["compliance_result"]["requires_cleaning"]
    report_id   = f"NautiCAI-{datetime.now().strftime('%Y-%m-%d')}-001"

    pdf = NautiCAIPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.section_title("1. VESSEL INSPECTION DETAILS")
    pdf.info_row("Vessel ID", vessel_id, highlight=True)
    pdf.info_row("Inspection Date", timestamp)
    pdf.info_row("Report Number", report_id, highlight=True)
    pdf.info_row("Inspection Type", "Automated Underwater Hull Assessment")
    pdf.info_row("Report Status", "COMPLETED - Audit Trail Generated")
    pdf.ln(8)

    pdf.section_title("2. HULL CONDITION FINDINGS")
    pdf.info_row("Inspection Method", "Automated Underwater Inspection", highlight=True)
    pdf.info_row("Total Hull Coverage", f"{coverage}%")
    pdf.info_row("Overall Condition", severity, highlight=True)
    pdf.info_row("Fouling Areas Identified", str(detections))
    pdf.ln(8)

    pdf.section_title("3. OFFICIAL COMPLIANCE RATING")
    pdf.rating_badge(rating, requires_cleaning)

    if requires_cleaning:
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(220, 20, 60)
    else:
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(34, 139, 34)
    pdf.set_font('Arial', 'B', 11)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 8, _pdf_safe(f'  Required Action: {action}'), 1, 'L', fill=True)
    pdf.ln(8)

    pdf.section_title("4. COMPLIANCE DECLARATION")
    pdf.set_font('Arial', 'I', 10)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(0, 7,
        '  This report was issued in accordance with IMO Biofouling '
        'Guidelines Resolution MEPC.207(62). All findings are fully '
        'repeatable and auditable.',
        0, 'L')

    # Embed annotated hull image (live view with detections) if available
    if annotated_path and os.path.isfile(annotated_path):
        try:
            pdf.add_page()
            pdf.set_font('Arial', '', 9)
            pdf.set_text_color(80, 80, 80)
            pdf.cell(0, 6, _pdf_safe("  Annotated inspection result – hull image with AI detections"), 0, 1, 'L')
            pdf.ln(2)
            pdf.image(annotated_path, x=10, w=190)
            pdf.ln(4)
        except Exception:
            pass

    pdf_path = os.path.join(output_folder, f"{vessel_id}_Audit_Report.pdf")
    pdf.output(pdf_path)
    return pdf_path


def create_combined_pdf(vessel_id, report_payloads, output_folder, annotated_paths=None):
    """
    Generate one PDF that includes all images in the batch (one section per image).
    report_payloads: list of report dicts (metadata, ai_vision_metrics, compliance_result).
    annotated_paths: optional list of paths to annotated images (same order as report_payloads).
    """
    if not report_payloads:
        return None
    annotated_paths = annotated_paths or []

    pdf = NautiCAIPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    report_id = f"NautiCAI-{datetime.now().strftime('%Y-%m-%d')}-001"
    n = len(report_payloads)

    # Summary / cover section
    pdf.add_page()
    pdf.section_title("1. VESSEL INSPECTION DETAILS (COMBINED REPORT)")
    pdf.info_row("Vessel ID", vessel_id, highlight=True)
    pdf.info_row("Report Number", report_id, highlight=True)
    pdf.info_row("Inspection Type", "Automated Underwater Hull Assessment (Multi-Image)")
    pdf.info_row("Total Images in This Report", str(n), highlight=True)
    pdf.info_row("Report Status", "COMPLETED - Audit Trail Generated", highlight=True)
    pdf.ln(8)

    # One section per image
    for idx, report_payload in enumerate(report_payloads):
        timestamp = report_payload["metadata"]["inspection_timestamp"]
        coverage = report_payload["ai_vision_metrics"]["total_hull_coverage_percentage"]
        severity = report_payload["ai_vision_metrics"]["severity"]
        detections = report_payload["ai_vision_metrics"]["total_detections"]
        rating = report_payload["compliance_result"]["official_imo_rating"]
        action = report_payload["compliance_result"]["recommended_action"]
        requires_cleaning = report_payload["compliance_result"]["requires_cleaning"]

        pdf.section_title(f"2.{idx + 1} IMAGE {idx + 1} OF {n} - HULL CONDITION FINDINGS")
        pdf.info_row("Inspection Date (this image)", timestamp)
        pdf.info_row("Total Hull Coverage", f"{coverage}%")
        pdf.info_row("Overall Condition", severity, highlight=True)
        pdf.info_row("Fouling Areas Identified", str(detections))
        pdf.ln(6)
        # Same as single-page PDF: rating banner + "!! IMMEDIATE CLEANING REQUIRED !!" + Required Action box (red/green border)
        pdf.rating_badge(rating, requires_cleaning)
        if requires_cleaning:
            pdf.set_fill_color(255, 255, 255)
            pdf.set_draw_color(220, 20, 60)
        else:
            pdf.set_fill_color(255, 255, 255)
            pdf.set_draw_color(34, 139, 34)
        pdf.set_font('Arial', 'B', 11)
        pdf.set_text_color(50, 50, 50)
        pdf.multi_cell(0, 8, _pdf_safe(f'  Required Action: {action}'), 1, 'L', fill=True)
        pdf.ln(6)

        # Embed annotated image if available (new page so layout is clean)
        if idx < len(annotated_paths) and annotated_paths[idx] and os.path.isfile(annotated_paths[idx]):
            try:
                pdf.add_page()
                pdf.set_font('Arial', '', 9)
                pdf.set_text_color(80, 80, 80)
                pdf.cell(0, 6, _pdf_safe(f"  Annotated result - Image {idx + 1} of {n}"), 0, 1, 'L')
                pdf.ln(2)
                pdf.image(annotated_paths[idx], x=10, w=190)
                pdf.ln(4)
            except Exception:
                pass

    # Overall compliance declaration
    pdf.section_title("3. COMPLIANCE DECLARATION")
    pdf.set_font('Arial', 'I', 10)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(0, 7,
        '  This report was issued in accordance with IMO Biofouling '
        'Guidelines Resolution MEPC.207(62). All findings are fully '
        'repeatable and auditable. This combined report covers %d image(s).' % n,
        0, 'L')

    pdf_path = os.path.join(output_folder, f"{vessel_id}_Audit_Report.pdf")
    pdf.output(pdf_path)
    return pdf_path


def _collect_report_payloads(reports_folder, vessel_id):
    """
    Load per-image reports: _0.json, _1.json, ... in order.
    If any exist, return those (combined report). Otherwise fall back to single vessel_id_inspection_data.json.
    Returns list of (index, payload).
    """
    out = []
    idx = 0
    while True:
        path = os.path.join(reports_folder, f"{vessel_id}_inspection_data_{idx}.json")
        if not os.path.isfile(path):
            break
        with open(path, "r") as f:
            out.append((idx, json.load(f)))
        idx += 1
    if not out:
        path = os.path.join(reports_folder, f"{vessel_id}_inspection_data.json")
        if os.path.isfile(path):
            with open(path, "r") as f:
                out.append((0, json.load(f)))
    return out


# ==========================================
# API ENDPOINTS
# ==========================================

# Root endpoint
@app.get("/")
async def root():
    return {
        "system": "NautiCAI Backend API",
        "version": "1.0.0",
        "status": "online",
        "message": "NautiCAI Automated Hull Inspection System is running."
    }

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


# Telegram bot: validate by username only (single source for who is accessing reports)
@app.get("/api/telegram/validate")
async def telegram_validate(username: str):
    """
    Validate for the bot. User enters username after /start.
    If username exists in DB → user is available, return display name.
    """
    u = (username or "").strip()
    if not u:
        raise HTTPException(status_code=400, detail="username required")
    if not POSTGRES_DSN or psycopg2 is None:
        return JSONResponse(content={"found": False, "reason": "Database not configured"})
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        with conn.cursor() as cur:
            cur.execute("SELECT id, email, username FROM users WHERE username = %s", (u.lower(),))
            row = cur.fetchone()
        if row:
            display = row.get("username") or row.get("email") or f"User {row.get('id')}"
            return JSONResponse(content={"found": True, "username": display})
        return JSONResponse(content={"found": False})
    except Exception as e:
        print(f"Telegram validate error: {e}")
        return JSONResponse(content={"found": False})
    finally:
        if conn is not None:
            conn.close()


def _user_id_from_username(conn, username: str) -> Optional[int]:
    """Resolve username to user id. Returns None if not found."""
    u = (username or "").strip().lower()
    if not u:
        return None
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username = %s", (u,))
        row = cur.fetchone()
    return row["id"] if row else None


# Telegram bot: get latest PDF by username only
@app.get("/api/telegram/latest-pdf")
async def telegram_latest_pdf(username: str):
    """Returns the latest inspection PDF for the user with this username."""
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    if not (username or "").strip():
        raise HTTPException(status_code=400, detail="username required")
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        uid = _user_id_from_username(conn, username)
        if uid is None:
            raise HTTPException(status_code=404, detail="User not found")
        with conn.cursor() as cur:
            # Latest = most recent by timestamp, then by id so one clear row (matches web “latest”)
            cur.execute(
                "SELECT vessel_id, id FROM agentic_inspections WHERE user_id = %s ORDER BY inspection_timestamp DESC, id DESC LIMIT 1",
                (uid,),
            )
            latest = cur.fetchone()
        conn.close()
        conn = None
        if not latest:
            raise HTTPException(status_code=404, detail="No inspections yet. Run an inspection in the web app first.")
        vessel_id = latest["vessel_id"]
        reports_folder = _reports_folder(uid)
        pdf_path = os.path.join(reports_folder, f"{vessel_id}_Audit_Report.pdf")
        if not os.path.isfile(pdf_path):
            # Build PDF on demand if we have JSON
            collected = _collect_report_payloads(reports_folder, vessel_id)
            if collected:
                if len(collected) > 1:
                    report_payloads = [p for _, p in collected]
                    annotated_paths = []
                    for idx, _ in collected:
                        p = os.path.join(reports_folder, f"{vessel_id}_annotated.jpg") if idx <= 0 else os.path.join(reports_folder, f"{vessel_id}_annotated_{idx}.jpg")
                        annotated_paths.append(p if os.path.isfile(p) else None)
                    create_combined_pdf(vessel_id, report_payloads, reports_folder, annotated_paths)
                else:
                    _, payload = collected[0]
                    ann = os.path.join(reports_folder, f"{vessel_id}_annotated.jpg")
                    create_pdf(vessel_id, payload, reports_folder, annotated_path=ann)
        if os.path.isfile(pdf_path):
            return FileResponse(
                path=pdf_path,
                filename=f"{vessel_id}_Audit_Report.pdf",
                media_type="application/pdf",
            )
        raise HTTPException(status_code=404, detail="Report file not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Telegram latest-pdf error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get report")
    finally:
        if conn is not None:
            conn.close()


# Telegram bot: get latest report JSON by username only
@app.get("/api/telegram/latest-report")
async def telegram_latest_report(username: str):
    """Returns the latest inspection JSON for the user with this username."""
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    if not (username or "").strip():
        raise HTTPException(status_code=400, detail="username required")
    conn = None
    try:
        conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
        uid = _user_id_from_username(conn, username)
        if uid is None:
            raise HTTPException(status_code=404, detail="User not found")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT vessel_id FROM agentic_inspections WHERE user_id = %s ORDER BY inspection_timestamp DESC, id DESC LIMIT 1",
                (uid,),
            )
            latest = cur.fetchone()
        conn.close()
        conn = None
        if not latest:
            raise HTTPException(status_code=404, detail="No inspections yet")
        vessel_id = latest["vessel_id"]
        reports_folder = _reports_folder(uid)
        for path in (
            os.path.join(reports_folder, f"{vessel_id}_inspection_data.json"),
            os.path.join(reports_folder, f"{vessel_id}_inspection_data_0.json"),
        ):
            if os.path.isfile(path):
                with open(path, "r") as f:
                    return JSONResponse(content=json.load(f))
        raise HTTPException(status_code=404, detail="Report file not found")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Telegram latest-report error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get report")
    finally:
        if conn is not None:
            conn.close()


# ==========================================
# AUTH ENDPOINTS (signup / login / me / forgot / reset)
# ==========================================
@app.post("/auth/signup")
async def auth_signup(payload: AuthPayload):
    """Create account. Requires username (unique). Returns token and user (id, email, username, telegram_user_id)."""
    try:
        if not POSTGRES_DSN or psycopg2 is None:
            raise HTTPException(status_code=500, detail="Auth not configured")
        email = (payload.email or "").strip().lower()
        raw_username = (payload.username or "").strip()
        if not email or not (payload.password or ""):
            raise HTTPException(status_code=400, detail="Email and password are required")
        if not raw_username:
            raise HTTPException(status_code=400, detail="Username is required")
        # Username: lowercase, letters numbers underscore period (Instagram-style)
        username = raw_username.lower()
        allowed = username.replace("_", "").replace(".", "").isalnum()
        if not allowed or len(username) < 2:
            raise HTTPException(status_code=400, detail="Username: 2+ characters, letters, numbers, underscore, period")
        conn = None
        try:
            conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="User already exists")
                cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Username not available")
                salt, pw_hash = _hash_password(payload.password)
                telegram_user_id = str(uuid.uuid4()).replace("-", "")[:24]
                cur.execute(
                    """
                    INSERT INTO users (email, password_salt, password_hash, telegram_user_id, username, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    RETURNING id, email, telegram_user_id, username
                    """,
                    (email, salt, pw_hash, telegram_user_id, username),
                )
                user = cur.fetchone()
            conn.commit()
        finally:
            if conn is not None:
                conn.close()
        token = _create_session(user["id"])
        return {"token": token, "user": {"id": user["id"], "email": user["email"], "username": user.get("username"), "telegram_user_id": user.get("telegram_user_id")}}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth signup error: {e}")
        # If DB is missing username/telegram_user_id columns, run migrations/run_once_neon.sql in Neon
        err_msg = str(e).lower()
        if "does not exist" in err_msg or "column" in err_msg:
            raise HTTPException(
                status_code=503,
                detail="Signup unavailable: database schema needs update. Run migrations/run_once_neon.sql in Neon SQL Editor.",
            )
        raise HTTPException(status_code=500, detail="Sign up failed. Please try again.")


@app.post("/auth/login")
async def auth_login(payload: AuthPayload):
    """Login. Returns token and user (id, email, telegram_user_id)."""
    try:
        if not POSTGRES_DSN or psycopg2 is None:
            raise HTTPException(status_code=500, detail="Auth not configured")
        email = (payload.email or "").strip().lower()
        if not email or not (payload.password or ""):
            raise HTTPException(status_code=400, detail="Email and password are required")
        conn = None
        user = None
        try:
            conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, email, password_salt, password_hash, telegram_user_id, username FROM users WHERE email = %s",
                    (email,),
                )
                user = cur.fetchone()
            if not user or not _verify_password(payload.password, user["password_salt"], user["password_hash"]):
                raise HTTPException(status_code=401, detail="Invalid email or password")
        finally:
            if conn is not None:
                conn.close()
        token = _create_session(user["id"])
        return {"token": token, "user": {"id": user["id"], "email": user["email"], "username": user.get("username"), "telegram_user_id": user.get("telegram_user_id")}}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Auth login error: {e}")
        raise HTTPException(status_code=500, detail="Sign in failed. Please try again.")


@app.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    """Return current user (id, email, username, telegram_user_id) for Dashboard / Telegram setup."""
    user = _require_auth(authorization)
    return {"user": {"id": user["id"], "email": user["email"], "username": user.get("username"), "telegram_user_id": user.get("telegram_user_id")}}


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
    if user_id and pyjwt:
        reset_token = _create_reset_token(user_id)
        reset_url = f"{FRONTEND_URL.rstrip('/')}/reset-password?token={reset_token}"
        html = f"""
        <p>You requested a password reset for NautiCAI.</p>
        <p><a href="{reset_url}" style="color:#7c3aed;">Reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p>— NautiCAI</p>
        """
        _send_brevo_email(email, "Reset your NautiCAI password", html)
    return {"ok": True}


@app.post("/auth/reset-password")
async def auth_reset_password(payload: ResetPayload):
    """Reset password using token from email link."""
    if not POSTGRES_DSN or psycopg2 is None:
        raise HTTPException(status_code=500, detail="Auth not configured")
    token = (payload.token or "").strip()
    new_password = (payload.new_password or "").strip()
    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token and new password are required")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user_id = _verify_reset_token(token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    salt, pw_hash = _hash_password(new_password)
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
        raise HTTPException(status_code=500, detail="Failed to update password")
    finally:
        if conn is not None:
            conn.close()
    return {"ok": True}


def _process_one_image(temp_image_path: str, vessel_id: str, image_index: int, reports_folder: str) -> Tuple[dict, Optional[str]]:
    """Run vision pipeline on one image; save per-image JSON and annotated image. Returns (report_payload, dest_annotated_path)."""
    vision_report = vision_pipeline.process_image(temp_image_path)
    coverage = vision_report["coverage_percent"]
    severity = vision_report["severity"]
    detections = vision_report["detections"]
    imo_rating, action, requires_cleaning = calculate_imo_rating(coverage)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_payload = {
        "metadata": {
            "vessel_id": vessel_id,
            "inspection_timestamp": ts,
            "system_status": "COMPLETED"
        },
        "ai_vision_metrics": {
            "total_hull_coverage_percentage": coverage,
            "severity": severity,
            "total_detections": len(detections)
        },
        "compliance_result": {
            "official_imo_rating": imo_rating,
            "recommended_action": action,
            "requires_cleaning": requires_cleaning
        }
    }
    annotated_path = vision_report.get("annotated_path")
    dest_annotated = None
    if annotated_path and os.path.isfile(annotated_path):
        if image_index <= 0:
            dest_annotated = os.path.join(reports_folder, f"{vessel_id}_annotated.jpg")
        else:
            dest_annotated = os.path.join(reports_folder, f"{vessel_id}_annotated_{image_index}.jpg")
        shutil.copy2(annotated_path, dest_annotated)
    per_image_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data_{image_index}.json")
    with open(per_image_path, "w") as f:
        json.dump(report_payload, f, indent=4)
    json_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data.json")
    with open(json_path, "w") as f:
        json.dump(report_payload, f, indent=4)
    return report_payload, dest_annotated


# Batch inspection: all images in one request so one Cloud Run instance has all files (fixes 404 annotated + wrong PDF).
@app.post("/api/inspect/batch")
async def run_inspection_batch(
    vessel_id: str = Form(..., description="Vessel identifier"),
    images: List[UploadFile] = File(..., description="One or more hull images"),
    authorization: Optional[str] = Header(None),
):
    """Process all images on this instance so annotated images and combined PDF are available."""
    if not images:
        raise HTTPException(status_code=400, detail="At least one image required")
    user = _require_auth(authorization)
    uid = user["id"]
    vessel_id = _sanitize_vessel_id(vessel_id)
    reports_folder = _reports_folder(uid)
    temp_folder = "temp_uploads"
    os.makedirs(temp_folder, exist_ok=True)
    report_payloads: List[dict] = []
    annotated_paths: List[Optional[str]] = []
    try:
        for idx, image in enumerate(images):
            temp_image_path = os.path.join(temp_folder, image.filename or f"img_{idx}")
            with open(temp_image_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            payload, ann_path = _process_one_image(temp_image_path, vessel_id, idx, reports_folder)
            report_payloads.append(payload)
            annotated_paths.append(ann_path)
            if os.path.isfile(temp_image_path):
                os.remove(temp_image_path)
        if len(report_payloads) > 1:
            create_combined_pdf(vessel_id, report_payloads, reports_folder, annotated_paths)
        else:
            create_pdf(vessel_id, report_payloads[0], reports_folder, annotated_path=annotated_paths[0] if annotated_paths else None)
        _invalidate_vessels_cache(uid)
        if POSTGRES_DSN and psycopg2 is not None:
            try:
                from datetime import timezone
                ts_utc = datetime.now(timezone.utc)
                conn = psycopg2.connect(POSTGRES_DSN)
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO agentic_inspections (user_id, vessel_id, inspection_timestamp, image_count) VALUES (%s, %s, %s, %s)",
                        (uid, vessel_id, ts_utc, len(images)),
                    )
                conn.commit()
                conn.close()
            except Exception as db_e:
                print(f"Inspections insert warning: {db_e}")
        if telegram_notify:
            pdf_path = os.path.join(reports_folder, f"{vessel_id}_Audit_Report.pdf")
            try:
                telegram_notify.send_inspection_result(vessel_id, report_payloads[0], pdf_path)
            except Exception:
                pass
        return JSONResponse(content={"reports": report_payloads})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Main inspection endpoint (single image; for backward compat)
@app.post("/api/inspect")
async def run_inspection(
    vessel_id: str = Form(..., description="Vessel identifier"),
    image: UploadFile = File(...),
    image_index: int = Form(0, description="Index of image in batch (0, 1, 2, ...) for multi-image inspection"),
    authorization: Optional[str] = Header(None),
):
    """Accepts vessel ID and hull image. Saves report under the authenticated user only."""
    user = _require_auth(authorization)
    uid = user["id"]
    vessel_id = _sanitize_vessel_id(vessel_id)
    reports_folder = _reports_folder(uid)
    try:
        temp_folder = "temp_uploads"
        os.makedirs(temp_folder, exist_ok=True)
        temp_image_path = os.path.join(temp_folder, image.filename or "image")

        with open(temp_image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)

        report_payload, dest_annotated = _process_one_image(temp_image_path, vessel_id, image_index, reports_folder)
        create_pdf(vessel_id, report_payload, reports_folder, annotated_path=dest_annotated)
        _invalidate_vessels_cache(uid)

        if POSTGRES_DSN and psycopg2 is not None:
            try:
                from datetime import timezone
                ts_utc = datetime.now(timezone.utc)
                conn = psycopg2.connect(POSTGRES_DSN)
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO agentic_inspections (user_id, vessel_id, inspection_timestamp, image_count) VALUES (%s, %s, %s, %s)",
                        (uid, vessel_id, ts_utc, 1),
                    )
                conn.commit()
                conn.close()
            except Exception as db_e:
                print(f"Inspections insert warning: {db_e}")

        if telegram_notify:
            pdf_path = os.path.join(reports_folder, f"{vessel_id}_Audit_Report.pdf")
            try:
                telegram_notify.send_inspection_result(vessel_id, report_payload, pdf_path)
            except Exception:
                pass

        if os.path.isfile(temp_image_path):
            os.remove(temp_image_path)
        return JSONResponse(content=report_payload)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get all report payloads for a vessel (for multi-image slider when opening from Dashboard/Reports)
@app.get("/api/vessel/{vessel_id}/reports")
async def get_vessel_reports(vessel_id: str, authorization: Optional[str] = Header(None)):
    """Returns all per-image reports so the frontend can show the batch slider and correct metrics."""
    user = _require_auth(authorization)
    vessel_id = _sanitize_vessel_id(vessel_id)
    reports_folder = _reports_folder(user["id"])
    collected = _collect_report_payloads(reports_folder, vessel_id)
    report_payloads = [p for _, p in collected]
    return JSONResponse(content={"reports": report_payloads})


# Get latest JSON report for a vessel (auth required; only that user's vessel)
@app.get("/api/vessel/{vessel_id}/latest-report")
async def get_latest_report(vessel_id: str, authorization: Optional[str] = Header(None)):
    user = _require_auth(authorization)
    vessel_id = _sanitize_vessel_id(vessel_id)
    reports_folder = _reports_folder(user["id"])
    try:
        json_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data.json")
        with open(json_path, "r") as f:
            data = json.load(f)
        return JSONResponse(content=data)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"No inspection report found for vessel {vessel_id}"
        )

# Serve annotated image (auth required; only that user's vessel)
@app.get("/api/vessel/{vessel_id}/annotated-image")
async def get_annotated_image(vessel_id: str, index: int = 0, authorization: Optional[str] = Header(None)):
    user = _require_auth(authorization)
    vessel_id = _sanitize_vessel_id(vessel_id)
    reports_folder = _reports_folder(user["id"])
    if index <= 0:
        annotated_path = os.path.join(reports_folder, f"{vessel_id}_annotated.jpg")
    else:
        annotated_path = os.path.join(reports_folder, f"{vessel_id}_annotated_{index}.jpg")
    if os.path.exists(annotated_path):
        return FileResponse(path=annotated_path, media_type="image/jpeg")
    raise HTTPException(
        status_code=404,
        detail=f"No annotated image found for vessel {vessel_id} at index {index}"
    )

# Download PDF report for a vessel (auth required; only that user's vessel)
@app.get("/api/vessel/{vessel_id}/pdf")
async def download_pdf(vessel_id: str, authorization: Optional[str] = Header(None)):
    user = _require_auth(authorization)
    vessel_id = _sanitize_vessel_id(vessel_id)
    reports_folder = _reports_folder(user["id"])
    collected = _collect_report_payloads(reports_folder, vessel_id)
    if not collected:
        raise HTTPException(
            status_code=404,
            detail=f"No inspection report found for vessel {vessel_id}"
        )
    if len(collected) > 1:
        report_payloads = [p for _, p in collected]
        annotated_paths = []
        for idx, _ in collected:
            if idx <= 0:
                p = os.path.join(reports_folder, f"{vessel_id}_annotated.jpg")
            else:
                p = os.path.join(reports_folder, f"{vessel_id}_annotated_{idx}.jpg")
            annotated_paths.append(p if os.path.isfile(p) else None)
        create_combined_pdf(vessel_id, report_payloads, reports_folder, annotated_paths)
    else:
        _, payload = collected[0]
        ann_path = os.path.join(reports_folder, f"{vessel_id}_annotated.jpg")
        create_pdf(vessel_id, payload, reports_folder, annotated_path=ann_path)
    pdf_path = os.path.join(reports_folder, f"{vessel_id}_Audit_Report.pdf")
    if os.path.exists(pdf_path):
        return FileResponse(
            path=pdf_path,
            filename=f"{vessel_id}_Audit_Report.pdf",
            media_type="application/pdf"
        )
    raise HTTPException(status_code=404, detail=f"No PDF report found for vessel {vessel_id}")


@app.delete("/api/vessel/{vessel_id}")
async def delete_vessel(vessel_id: str, authorization: Optional[str] = Header(None)):
    """Delete one inspection (vessel) for the authenticated user. Removes DB rows and all report files."""
    user = _require_auth(authorization)
    uid = user["id"]
    vessel_id = _sanitize_vessel_id(vessel_id)
    reports_folder = _reports_folder(uid)
    if POSTGRES_DSN and psycopg2 is not None:
        try:
            conn = psycopg2.connect(POSTGRES_DSN)
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM agentic_inspections WHERE user_id = %s AND vessel_id = %s",
                    (uid, vessel_id),
                )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"delete_vessel DB: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete inspection record")
    prefix = vessel_id + "_"
    if os.path.isdir(reports_folder):
        for name in os.listdir(reports_folder):
            if name.startswith(prefix) or name == vessel_id:
                path = os.path.join(reports_folder, name)
                try:
                    if os.path.isfile(path):
                        os.remove(path)
                except OSError as e:
                    print(f"delete_vessel file {path}: {e}")
    _invalidate_vessels_cache(uid)
    return JSONResponse(content={"ok": True, "vessel_id": vessel_id}, status_code=200)


def _invalidate_vessels_cache(user_id: int) -> None:
    _vessels_cache.pop(user_id, None)


# Get list of all inspected vessels for the authenticated user only
@app.get("/api/vessels/all")
async def get_all_vessels(authorization: Optional[str] = Header(None)):
    """Returns vessels that this user has inspected (from DB + reports/{user_id}/)."""
    user = _require_auth(authorization)
    uid = user["id"]
    now_ts = datetime.now().timestamp()
    cached = _vessels_cache.get(uid)
    if cached and now_ts < cached[0]:
        return JSONResponse(content=cached[1])
    reports_folder = _reports_folder(uid)
    vessels = []
    if POSTGRES_DSN and psycopg2 is not None:
        try:
            conn = psycopg2.connect(POSTGRES_DSN, cursor_factory=RealDictCursor)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT vessel_id, inspection_timestamp as last_inspection, image_count
                    FROM (
                        SELECT vessel_id, inspection_timestamp, image_count,
                               ROW_NUMBER() OVER (PARTITION BY vessel_id ORDER BY inspection_timestamp DESC) AS rn
                        FROM agentic_inspections WHERE user_id = %s
                    ) t WHERE rn = 1
                    """,
                    (uid,),
                )
                rows = cur.fetchall()
            conn.close()
            for row in rows:
                vessel_id = row["vessel_id"]
                main_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data.json")
                fallback_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data_0.json")
                data = None
                if os.path.isfile(main_path):
                    with open(main_path, "r") as f:
                        data = json.load(f)
                elif os.path.isfile(fallback_path):
                    with open(fallback_path, "r") as f:
                        data = json.load(f)
                imo_rating = data["compliance_result"]["official_imo_rating"] if data else "—"
                requires_cleaning = data["compliance_result"]["requires_cleaning"] if data else False
                ts = row["last_inspection"]
                last_ts = ts.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts, "strftime") else str(ts)
                vessels.append({
                    "vessel_id": vessel_id,
                    "last_inspection": last_ts,
                    "imo_rating": imo_rating,
                    "requires_cleaning": requires_cleaning,
                    "image_count": row.get("image_count") or 1,
                })
            payload = {"vessels": vessels}
            _vessels_cache[uid] = (datetime.now().timestamp() + VESSELS_CACHE_TTL_SEC, payload)
            return JSONResponse(content=payload)
        except Exception as e:
            if "does not exist" not in str(e).lower():
                print(f"get_all_vessels DB: {e}")
    vessel_ids = set()
    per_image_count = {}
    if os.path.exists(reports_folder):
        for file in os.listdir(reports_folder):
            if not file.endswith(".json"):
                continue
            if file.endswith("_inspection_data.json"):
                vessel_id = file.replace("_inspection_data.json", "")
                vessel_ids.add(vessel_id)
            elif "_inspection_data_" in file and file.endswith(".json"):
                prefix, rest = file.rsplit("_inspection_data_", 1)
                if rest.endswith(".json") and rest[:-5].isdigit():
                    vessel_id = prefix
                    vessel_ids.add(vessel_id)
                    per_image_count[vessel_id] = per_image_count.get(vessel_id, 0) + 1
    for vessel_id in sorted(vessel_ids):
        main_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data.json")
        fallback_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data_0.json")
        data = None
        if os.path.isfile(main_path):
            with open(main_path, "r") as f:
                data = json.load(f)
        elif os.path.isfile(fallback_path):
            with open(fallback_path, "r") as f:
                data = json.load(f)
        if not data:
            continue
        vessels.append({
            "vessel_id": vessel_id,
            "last_inspection": data["metadata"]["inspection_timestamp"],
            "imo_rating": data["compliance_result"]["official_imo_rating"],
            "requires_cleaning": data["compliance_result"]["requires_cleaning"],
            "image_count": per_image_count.get(vessel_id, 1),
        })
    payload = {"vessels": vessels}
    _vessels_cache[uid] = (datetime.now().timestamp() + VESSELS_CACHE_TTL_SEC, payload)
    return JSONResponse(content=payload)

# ==========================================
# RUN THE SERVER (optionally start Telegram bot with backend)
# ==========================================
if __name__ == "__main__":
    import subprocess
    import atexit
    import signal
    _bot_process = None
    if os.environ.get("NAUTICAI_START_TELEGRAM_BOT", "").strip().lower() in ("1", "true", "yes"):
        _backend_dir = os.path.dirname(os.path.abspath(__file__))
        _bot_script = os.path.join(_backend_dir, "nauticai_telegram_bot.py")
        if os.path.isfile(_bot_script):
            # Don't use stderr=PIPE: parent never reads it, so the pipe fills and the bot blocks.
            # Use DEVNULL so the bot never blocks on write; it stays responsive to /start etc.
            _bot_process = subprocess.Popen(
                [sys.executable, "nauticai_telegram_bot.py"],
                cwd=_backend_dir,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            print("[NautiCAI] Telegram bot started (NAUTICAI_START_TELEGRAM_BOT=1). Stop with Ctrl+C.")
            def _kill_bot():
                if _bot_process and _bot_process.poll() is None:
                    _bot_process.terminate()
                    _bot_process.wait(timeout=5)
            atexit.register(_kill_bot)
            def _on_exit(signum=None, frame=None):
                _kill_bot()
                sys.exit(0 if signum else 0)
            signal.signal(signal.SIGINT, _on_exit)
            if hasattr(signal, "SIGTERM"):
                signal.signal(signal.SIGTERM, _on_exit)
        else:
            print("[NautiCAI] NAUTICAI_START_TELEGRAM_BOT=1 but nauticai_telegram_bot.py not found.")
    # reload=False avoids spawn/reload on file save; on Windows, reload + torch can hang in platform.machine()/WMI
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(
        "nauticai_api:app",
        host="0.0.0.0",
        port=port,
        reload=False,
    )