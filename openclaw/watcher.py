# ============================================================
# NautiCAI OpenClaw Watcher
# Version: 1.0.0
# Description: Always-on autonomous watcher that detects
# new ROV images in the incoming/ folder and automatically
# triggers the NautiCAI inspection pipeline.
#
# Flow:
#   ROV transfers images to incoming/
#   → OpenClaw detects instantly
#   → Reads vessel ID from filename
#   → Checks OpenShell policy
#   → Calls existing pipeline via API
#   → Moves image to processed/ or failed/
#   → Sends technical alerts if needed
#   → Logs everything for audit trail
#
# Usage:
#   cd <NautiCAI repo root>   # directory that contains openclaw/ and incoming/
#   pip install -r openclaw/requirements.txt
#   python3 openclaw/watcher.py
#
# Env (see ../.env.example):
#   BACKEND_URL, OPENCLAW_API_TOKEN, OPENCLAW_INCOMING_DIR, OPENCLAW_PROCESSED_DIR, OPENCLAW_FAILED_DIR
#
# Auto-start on Jetson boot:
#   sudo systemctl enable nauticai-watcher
#   sudo systemctl start nauticai-watcher
# ============================================================

from __future__ import annotations

import os
import sys
import time
import json
import shutil
import re
import logging
import requests
import threading
from pathlib import Path
from datetime import datetime
from typing import Optional

# ============================================================
# SETUP — Load environment and paths
# ============================================================

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Load .env file (PROJECT_ROOT/.env — same folder as openclaw/)
_BACKEND_ENV = (
    PROJECT_ROOT
    / "AgenticAI_Backend"
    / "NautiCAI AI"
    / "NautiCAI_Backend"
    / ".env"
)


def _merge_telegram_from_backend_env() -> None:
    """Fill TELEGRAM_* from backend .env when unset (token often lives there, not NautiCAI/.env)."""
    if not _BACKEND_ENV.is_file():
        return
    try:
        from dotenv import dotenv_values
    except ImportError:
        return
    for key, val in dotenv_values(_BACKEND_ENV).items():
        if not key.startswith("TELEGRAM_"):
            continue
        if val is None or not str(val).strip():
            continue
        if (os.environ.get(key) or "").strip():
            continue
        os.environ[key] = str(val).strip()


def _load_env():
    env_path = PROJECT_ROOT / ".env"
    if env_path.is_file():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path, override=True, encoding="utf-8-sig")
        except ImportError:
            # Manual fallback if python-dotenv not installed
            for line in env_path.read_text(encoding="utf-8-sig").splitlines():
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                key, _, val = s.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key and val:
                    os.environ[key] = val
    _merge_telegram_from_backend_env()


_load_env()


def _path_from_env(key: str, default: Path) -> Path:
    """Absolute path from env, or default. Expands ~ and resolves."""
    raw = (os.environ.get(key) or "").strip().strip('"').strip("'")
    if not raw:
        return default
    # WSL/Linux: treat C:\... or C:/... as /mnt/c/...
    if sys.platform != "win32" and len(raw) >= 2 and raw[1] == ":":
        drive = raw[0].lower()
        rest = raw[2:].lstrip("/\\").replace("\\", "/")
        p = Path(f"/mnt/{drive}") / rest
        return p.expanduser().resolve()
    return Path(raw).expanduser().resolve()


# ============================================================
# CONFIGURATION
# ============================================================

# Folders (override with OPENCLAW_* — e.g. watch ~/Downloads/check)
INCOMING_DIR = _path_from_env("OPENCLAW_INCOMING_DIR", PROJECT_ROOT / "incoming")
PROCESSED_DIR = _path_from_env("OPENCLAW_PROCESSED_DIR", PROJECT_ROOT / "processed")
FAILED_DIR = _path_from_env("OPENCLAW_FAILED_DIR", PROJECT_ROOT / "failed")
LOG_FILE = PROJECT_ROOT / "openclaw" / "watcher.log"
POLICY_FILE = PROJECT_ROOT / "openclaw" / "openclaw.yaml"

# Backend API
BACKEND_URL = (os.environ.get("BACKEND_URL") or "http://localhost:8000").rstrip("/")
INSPECT_SINGLE_URL = f"{BACKEND_URL}/api/inspect"
INSPECT_BATCH_URL = f"{BACKEND_URL}/api/inspect/batch"
_health = (os.environ.get("OPENCLAW_HEALTH_URL") or "").strip()
if _health.startswith("http"):
    HEALTH_URL = _health.rstrip("/")
elif _health:
    HEALTH_URL = f"{BACKEND_URL}/{_health.lstrip('/')}"
else:
    HEALTH_URL = f"{BACKEND_URL}/health"
AUTH_TOKEN = os.environ.get("OPENCLAW_API_TOKEN", "")
USE_BATCH_MODE     = True

# Telegram
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")

# Watcher settings
COOLDOWN_SECONDS   = 2      # Wait after file detected before processing
BATCH_QUIET_SECONDS = 10    # If no new file arrives for this many seconds, close the batch
BATCH_POLL_SECONDS  = 2     # How often batch worker checks for ready groups
BACKEND_TIMEOUT    = 120    # Seconds to wait for pipeline response
BACKEND_TIMEOUT_PER_IMAGE = 15  # Extra seconds per image for large batches
BACKEND_TIMEOUT_MAX = 1800  # Hard cap for one request timeout (30 min)
TIMEOUT_GRACE_SECONDS = 180  # After read-timeout, poll backend to confirm completion
TIMEOUT_GRACE_POLL_SECONDS = 6
HEALTH_CHECK_RETRY = 5      # Retry backend health check this many times
HEALTH_CHECK_WAIT  = 10     # Seconds between health check retries

# Allowed image extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".mp4", ".avi", ".mov"}

# In-memory batch state
# Structure:
# {
#   vessel_id: {
#       "files": [Path(...), Path(...)],
#       "last_seen": <timestamp>
#   }
# }
BATCH_STATE = {}
BATCH_LOCK = threading.Lock()

# ============================================================
# LOGGING SETUP
# ============================================================

LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("NautiCAI-OpenClaw")

# ============================================================
# TELEGRAM TECHNICAL ALERTS ONLY
# ============================================================

def send_telegram(message: str) -> bool:
    """Send a Telegram message to the superintendent."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log.debug(
            "Telegram skip: need TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID "
            "(backend .env is merged automatically; chat_id is your numeric Telegram user id)."
        )
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML"
        }
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            log.info("Telegram notification sent successfully")
            return True
        else:
            log.warning(f"Telegram send failed: {response.status_code} {response.text}")
            return False
    except Exception as e:
        log.error(f"Telegram error: {e}")
        return False

# ============================================================
# VESSEL ID EXTRACTION
# Read vessel ID from image filename
# Convention: {VESSEL_ID}_{DATE}_{SEQUENCE}.jpg
# Example: MV_PACIFIC_TRADER_20260403_001.jpg → MV_PACIFIC_TRADER
# ============================================================

def extract_vessel_id(filename: str) -> str:
    """
    Extract vessel ID from filename.
    Strips date (8 digits) and sequence number from end.
    Falls back to full stem if pattern not found.
    """
    forced = (os.environ.get("OPENCLAW_FORCE_VESSEL_ID") or "").strip()
    if forced:
        return forced[:200]

    stem = Path(filename).stem  # e.g. MV_PACIFIC_TRADER_20260403_001
    # Common dataset/export suffix (e.g. ".rf.<hash>") should not split batches.
    stem = re.sub(r"\.rf\.[0-9a-fA-F]+$", "", stem)
    stem = stem.replace(" ", "_")
    parts = [p for p in stem.split("_") if p]

    # Walk backwards and strip date and sequence parts
    clean_parts = []
    for part in reversed(parts):
        lower = part.lower().strip()
        # Skip extension-like markers embedded in names (e.g. *_jpg or *_png)
        if lower in {"jpg", "jpeg", "png", "webp", "bmp"}:
            continue
        # Skip frame tokens in dataset-style names (frame0-14-41-50, frame1n-29-, ...)
        if lower.startswith("frame"):
            continue
        # Skip 8-digit dates like 20260403
        if part.isdigit() and len(part) == 8:
            continue
        # Skip sequence numbers like 001, 002
        if part.isdigit() and len(part) <= 4:
            continue
        clean_parts.insert(0, part)

    vessel_id = "_".join(clean_parts).strip("_")

    # Fallback to full stem if result is empty
    if not vessel_id:
        vessel_id = stem or "inspection_batch"

    return vessel_id[:200]  # Cap length

# ============================================================
# BATCH QUEUE HELPERS
# Group files by vessel and wait for quiet period before processing
# ============================================================

def queue_file_for_batch(path: Path) -> None:
    """Add a file to the in-memory batch queue for its vessel."""
    vessel_id = extract_vessel_id(path.name)
    now = time.time()

    with BATCH_LOCK:
        state = BATCH_STATE.setdefault(vessel_id, {"files": [], "last_seen": now})
        if path not in state["files"]:
            state["files"].append(path)
        state["last_seen"] = now

    log.info(f"Queued for batch | vessel={vessel_id} | file={path.name}")

# ============================================================
# BATCH WORKER
# Flush ready vessel batches after quiet period
# ============================================================

def get_ready_batches() -> list[tuple[str, list[Path]]]:
    """Return vessel batches that have been quiet long enough to process."""
    now = time.time()
    ready = []

    with BATCH_LOCK:
        for vessel_id, state in list(BATCH_STATE.items()):
            files = [p for p in state["files"] if p.exists()]
            if not files:
                BATCH_STATE.pop(vessel_id, None)
                continue

            if now - state["last_seen"] >= BATCH_QUIET_SECONDS:
                ready.append((vessel_id, files))
                BATCH_STATE.pop(vessel_id, None)

    return ready


def run_pipeline_batch(image_paths: list[Path], vessel_id: str) -> Optional[dict]:
    """
    Call the existing NautiCAI batch inspection pipeline.
    Returns result dict on success, None on failure.
    """
    log.info(f"Triggering batch pipeline | vessel={vessel_id} | files={len(image_paths)}")
    start_time = time.time()

    try:
        headers = {}
        if AUTH_TOKEN:
            headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
        expected_count = len(image_paths)
        timeout_seconds = min(
            BACKEND_TIMEOUT_MAX,
            max(BACKEND_TIMEOUT, 30 + (expected_count * BACKEND_TIMEOUT_PER_IMAGE)),
        )
        baseline_count = _get_report_count(vessel_id, headers)
        log.info(
            "Batch request timeout set to %ss | vessel=%s | files=%s",
            timeout_seconds,
            vessel_id,
            expected_count,
        )

        opened_files = []
        try:
            for image_path in image_paths:
                f = open(image_path, "rb")
                opened_files.append(("images", (image_path.name, f, "image/jpeg")))

            data = {"vessel_id": vessel_id}
            response = requests.post(
                INSPECT_BATCH_URL,
                files=opened_files,
                data=data,
                headers=headers,
                timeout=timeout_seconds
            )
        finally:
            for _, (_, f, _) in opened_files:
                try:
                    f.close()
                except Exception:
                    pass

        elapsed = round(time.time() - start_time, 2)

        if response.status_code == 200:
            result = response.json()
            log.info(f"Batch pipeline complete in {elapsed}s | vessel={vessel_id} | files={len(image_paths)}")
            return {"result": result, "elapsed": elapsed}

        log.error(f"Batch pipeline failed: HTTP {response.status_code} | {response.text}")
        return None

    except requests.exceptions.ReadTimeout:
        elapsed = round(time.time() - start_time, 2)
        log.warning(
            "Batch request timed out after %ss | vessel=%s | files=%s. "
            "Checking backend for late completion...",
            timeout_seconds,
            vessel_id,
            len(image_paths),
        )
        if _wait_for_report_growth(vessel_id, headers, baseline_count, len(image_paths)):
            log.info(
                "Backend completed batch after timeout | vessel=%s | files=%s | elapsed=%ss",
                vessel_id,
                len(image_paths),
                elapsed,
            )
            return {"result": {"timeout_recovered": True}, "elapsed": elapsed}
        log.error(
            "Batch timed out and no completion observed | vessel=%s | files=%s",
            vessel_id,
            len(image_paths),
        )
        return None
    except Exception as e:
        log.error(f"Batch pipeline exception for vessel {vessel_id}: {e}")
        return None


def _get_report_count(vessel_id: str, headers: dict) -> Optional[int]:
    """Best-effort count of reports currently saved for vessel."""
    url = f"{BACKEND_URL}/api/vessel/{vessel_id}/reports"
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            return None
        data = response.json()
        reports = data.get("reports")
        if isinstance(reports, list):
            return len(reports)
    except Exception:
        return None
    return None


def _wait_for_report_growth(
    vessel_id: str,
    headers: dict,
    baseline_count: Optional[int],
    expected_new: int,
) -> bool:
    """
    After client-side timeout, poll backend for a short window.
    If report count increases by expected_new (or reaches expected_new when baseline unknown),
    treat the batch as successful to avoid false move-to-failed.
    """
    deadline = time.time() + TIMEOUT_GRACE_SECONDS
    while time.time() < deadline:
        current = _get_report_count(vessel_id, headers)
        if current is not None:
            if baseline_count is not None:
                if current >= (baseline_count + expected_new):
                    return True
            elif current >= expected_new:
                return True
        time.sleep(TIMEOUT_GRACE_POLL_SECONDS)
    return False


def move_batch_to_processed(image_paths: list[Path]) -> None:
    """Move a successful batch to processed/."""
    for image_path in image_paths:
        if image_path.exists():
            move_to_processed(image_path)


def move_batch_to_failed(image_paths: list[Path]) -> None:
    """Move a failed batch to failed/."""
    for image_path in image_paths:
        if image_path.exists():
            move_to_failed(image_path)


def move_to_processed(image_path: Path) -> None:
    """Move successfully processed image to processed/ folder."""
    PROCESSED_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = PROCESSED_DIR / f"{timestamp}_{image_path.name}"
    shutil.move(str(image_path), str(dest))
    log.info(f"Moved to processed/: {dest.name}")


def move_to_failed(image_path: Path) -> None:
    """Move failed image to failed/ folder for manual retry."""
    FAILED_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = FAILED_DIR / f"{timestamp}_{image_path.name}"
    shutil.move(str(image_path), str(dest))
    log.info(f"Moved to failed/: {dest.name}")


AUDIT_LOG = PROJECT_ROOT / "openclaw" / "audit.jsonl"


def write_audit_log(
    filename: str,
    vessel_id: str,
    status: str,
    pipeline_result: Optional[dict],
    elapsed: float,
    error: Optional[str] = None,
) -> None:
    """Append one JSON line per file for compliance / debugging."""
    record = {
        "ts": datetime.now().isoformat(),
        "filename": filename,
        "vessel_id": vessel_id,
        "status": status,
        "elapsed_s": elapsed,
        "error": error,
        "pipeline": pipeline_result,
    }
    try:
        AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(AUDIT_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=str) + "\n")
    except OSError as e:
        log.warning(f"Audit log write failed: {e}")


def notify_result(vessel_id: str, result: dict, elapsed: float) -> None:
    """Telegram summary after a successful batch pipeline (result from run_pipeline_batch)."""
    inner = result.get("result") if isinstance(result, dict) else None
    lines = [
        "NautiCAI OpenClaw: batch inspection <b>complete</b>",
        f"Vessel: <b>{vessel_id}</b>",
        f"Elapsed: {elapsed}s",
    ]
    if isinstance(inner, dict):
        for key in ("job_id", "inspection_id", "id", "status", "message"):
            val = inner.get(key)
            if val is not None:
                lines.append(f"{key}: {val}")
    log.info(f"Batch pipeline success | vessel={vessel_id} | {elapsed}s")
    send_telegram("\n".join(lines))


def process_batch(vessel_id: str, image_paths: list[Path]) -> None:
    """Process a completed batch for one vessel."""
    start = time.time()
    filenames = [p.name for p in image_paths]

    log.info(f"Processing batch | vessel={vessel_id} | files={filenames}")

    result = run_pipeline_batch(image_paths, vessel_id)
    elapsed = round(time.time() - start, 2)

    if result:
        move_batch_to_processed(image_paths)
        notify_result(vessel_id, result, elapsed)
        for p in image_paths:
            write_audit_log(p.name, vessel_id, "processed", result, elapsed)
    else:
        move_batch_to_failed(image_paths)
        send_telegram(
            f"NautiCAI ALERT: Batch pipeline failed for vessel <b>{vessel_id}</b>.\n"
            f"Files moved to failed/ folder."
        )
        for p in image_paths:
            write_audit_log(p.name, vessel_id, "failed", None, elapsed, "Batch pipeline returned no result")


def start_batch_worker() -> None:
    """Background worker that flushes quiet vessel batches."""
    def _worker():
        while True:
            try:
                ready = get_ready_batches()
                for vessel_id, image_paths in ready:
                    t = threading.Thread(target=process_batch, args=(vessel_id, image_paths), daemon=True)
                    t.start()
            except Exception as e:
                log.error(f"Batch worker error: {e}")
            time.sleep(BATCH_POLL_SECONDS)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    log.info("Batch worker started")

# ============================================================
# POLICY CHECK
# Read OpenShell YAML and verify watcher is within bounds
# ============================================================

def check_policy() -> bool:
    """Check OpenShell policy file exists and is valid."""
    if not POLICY_FILE.exists():
        log.error(f"OpenShell policy file not found: {POLICY_FILE}")
        send_telegram("NautiCAI ALERT: OpenShell policy file missing. Watcher cannot start.")
        return False
    try:
        import yaml
        with open(POLICY_FILE) as f:
            policy = yaml.safe_load(f)
        if not policy or "policy" not in policy:
            log.error("OpenShell policy file is invalid or empty")
            return False
        log.info(f"OpenShell policy loaded: {policy['policy'].get('name', 'unknown')} v{policy['policy'].get('version', '?')}")
        return True
    except ImportError:
        # If PyYAML not installed just confirm file exists
        log.warning("PyYAML not installed — skipping policy validation. File exists, proceeding.")
        return True
    except Exception as e:
        log.error(f"Policy check error: {e}")
        return False

# ============================================================
# BACKEND HEALTH CHECK
# Confirm pipeline is ready before processing images
# ============================================================

def wait_for_backend() -> bool:
    """Wait for backend to be ready. Retry with backoff."""
    for attempt in range(1, HEALTH_CHECK_RETRY + 1):
        try:
            response = requests.get(HEALTH_URL, timeout=10)
            if response.status_code == 200:
                log.info(f"Backend ready on attempt {attempt}")
                return True
        except Exception:
            pass
        log.warning(f"Backend not ready — attempt {attempt}/{HEALTH_CHECK_RETRY}. Retrying in {HEALTH_CHECK_WAIT}s...")
        time.sleep(HEALTH_CHECK_WAIT)
    log.error("Backend unreachable after all retries")
    send_telegram(f"NautiCAI ALERT: Backend unreachable on port 8000. Images queued in incoming/.")
    return False

# ============================================================
# PIPELINE TRIGGER
# Send image to existing /api/inspect endpoint
# ============================================================


# ============================================================
# FOLDER WATCHER
# Uses watchdog to monitor incoming/ folder
# ============================================================

def start_watcher() -> None:
    """Start the OpenClaw folder watcher using watchdog."""
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler

        class ROVImageHandler(FileSystemEventHandler):
            def __init__(self):
                self._lock = threading.Lock()
                self._processing = set()

            def on_created(self, event):
                if event.is_directory:
                    return
                self._handle(Path(event.src_path))

            def on_moved(self, event):
                if event.is_directory:
                    return
                self._handle(Path(event.dest_path))

            def _handle(self, path: Path):
                # Ignore hidden files and temp files
                if path.name.startswith(".") or path.name.startswith("~"):
                    return
                # Ignore non-image files
                if path.suffix.lower() not in ALLOWED_EXTENSIONS:
                    return
                # Prevent duplicate processing
                with self._lock:
                    if str(path) in self._processing:
                        return
                    self._processing.add(str(path))
                # Queue file for grouped batch processing
                t = threading.Thread(target=self._process, args=(path,), daemon=True)
                t.start()

            def _process(self, path: Path):
                try:
                    queue_file_for_batch(path)
                finally:
                    with self._lock:
                        self._processing.discard(str(path))

        INCOMING_DIR.mkdir(exist_ok=True)
        handler  = ROVImageHandler()
        observer = Observer()
        observer.schedule(handler, str(INCOMING_DIR), recursive=False)
        observer.start()

        log.info(f"OpenClaw watching: {INCOMING_DIR}")
        send_telegram("NautiCAI OpenClaw is online. Watching for ROV images. Ready for inspection.")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
            log.info("OpenClaw stopped by operator")
            send_telegram("NautiCAI OpenClaw has stopped. Manual restart required.")

        observer.join()

    except ImportError:
        log.error("watchdog library not installed. Run: pip install watchdog")
        log.info("Falling back to polling mode...")
        start_polling_watcher()

# ============================================================
# POLLING FALLBACK
# If watchdog not available use simple polling
# ============================================================

def start_polling_watcher() -> None:
    """Fallback polling watcher — checks incoming/ every 3 seconds."""
    INCOMING_DIR.mkdir(exist_ok=True)
    log.info(f"OpenClaw polling mode: checking {INCOMING_DIR} every 3 seconds")
    send_telegram("NautiCAI OpenClaw is online (polling mode). Watching for ROV images.")

    seen = set()
    try:
        while True:
            for f in INCOMING_DIR.iterdir():
                if f.is_file() and str(f) not in seen:
                    if f.suffix.lower() in ALLOWED_EXTENSIONS:
                        seen.add(str(f))
                        t = threading.Thread(target=queue_file_for_batch, args=(f,), daemon=True)
                        t.start()
            time.sleep(3)
    except KeyboardInterrupt:
        log.info("OpenClaw stopped by operator")
        send_telegram("NautiCAI OpenClaw has stopped. Manual restart required.")

# ============================================================
# MAIN ENTRY POINT
# ============================================================

def main():
    log.info("=" * 60)
    log.info("NautiCAI OpenClaw Watcher Starting")
    env_file = PROJECT_ROOT / ".env"
    log.info(f"Project root : {PROJECT_ROOT}")
    log.info(f"Env file     : {env_file} ({'found' if env_file.is_file() else 'missing'})")
    log.info(f"Incoming     : {INCOMING_DIR}")
    if not (os.environ.get("OPENCLAW_INCOMING_DIR") or "").strip():
        log.warning(
            "OPENCLAW_INCOMING_DIR is not set — using repo incoming/ folder. "
            f"To watch another folder (e.g. Downloads), add OPENCLAW_INCOMING_DIR to {env_file}"
        )
    if not AUTH_TOKEN:
        log.warning(
            "OPENCLAW_API_TOKEN is empty — /api/inspect/batch will return 401. "
            "Set JWT in .env (browser localStorage nauticai:token after login)."
        )
    log.info(f"Processed    : {PROCESSED_DIR}")
    log.info(f"Failed       : {FAILED_DIR}")
    log.info(f"Backend      : {BACKEND_URL}")
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        log.info("Telegram alerts: enabled (startup/stop and pipeline notices)")
    else:
        missing = []
        if not (TELEGRAM_BOT_TOKEN or "").strip():
            missing.append("TELEGRAM_BOT_TOKEN")
        if not (TELEGRAM_CHAT_ID or "").strip():
            missing.append("TELEGRAM_CHAT_ID")
        log.info(
            "Telegram alerts: off — set %s in NautiCAI/.env or %s (bot process is separate; watcher needs chat_id too)",
            " + ".join(missing),
            _BACKEND_ENV,
        )
    log.info("=" * 60)

    # Step 1 — Check OpenShell policy
    if not check_policy():
        log.error("Policy check failed. Watcher cannot start.")
        sys.exit(1)

    # Step 2 — Create folders
    INCOMING_DIR.mkdir(exist_ok=True)
    PROCESSED_DIR.mkdir(exist_ok=True)
    FAILED_DIR.mkdir(exist_ok=True)
    log.info("Folders ready")

    # Step 3 — Wait for backend
    log.info("Waiting for NautiCAI backend to be ready...")
    if not wait_for_backend():
        log.warning("Backend not ready — watcher will start anyway and retry on each image")

    # Step 4 — Start batch worker
    start_batch_worker()

    # Step 5 — Start watching
    log.info("Starting OpenClaw folder watcher...")
    start_watcher()


if __name__ == "__main__":
    main()
