# NautiCAI – send inspection results to Charan (or any configured chat) via Telegram
# Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in env. If unset, no messages are sent.

import os
import urllib.request
import json

def _send_message(token: str, chat_id: str, text: str) -> bool:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception:
        return False

def _send_document(token: str, chat_id: str, file_path: str, caption: str = "") -> bool:
    try:
        import requests
    except ImportError:
        return False
    url = f"https://api.telegram.org/bot{token}/sendDocument"
    with open(file_path, "rb") as f:
        files = {"document": (os.path.basename(file_path), f)}
        data = {"chat_id": chat_id, "caption": caption[:1024] if caption else ""}
        try:
            r = requests.post(url, data=data, files=files, timeout=30)
            return r.status_code == 200
        except Exception:
            return False

def send_inspection_result(vessel_id: str, report_payload: dict, pdf_path: str = None):
    """
    Notify Telegram (Charan) when an inspection completes.
    Call this from the API after POST /api/inspect succeeds.
    Requires env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
    """
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        return

    meta = report_payload.get("metadata", {})
    metrics = report_payload.get("ai_vision_metrics", {})
    compliance = report_payload.get("compliance_result", {})
    coverage = metrics.get("total_hull_coverage_percentage", 0)
    severity = metrics.get("severity", "")
    rating = compliance.get("official_imo_rating", "")
    action = compliance.get("recommended_action", "")
    requires = compliance.get("requires_cleaning", False)
    ts = meta.get("inspection_timestamp", "")

    status = "🔴 CRITICAL – immediate action" if requires else "🟢 ACCEPTABLE"
    text = (
        f"<b>NautiCAI – inspection complete</b>\n\n"
        f"<b>Vessel:</b> {vessel_id}\n"
        f"<b>Time:</b> {ts}\n"
        f"<b>Hull coverage:</b> {coverage}%\n"
        f"<b>Condition:</b> {severity}\n"
        f"<b>IMO rating:</b> {rating}\n"
        f"<b>Status:</b> {status}\n"
        f"<b>Action:</b> {action}\n"
    )
    _send_message(token, chat_id, text)
    if pdf_path and os.path.isfile(pdf_path):
        _send_document(token, chat_id, pdf_path, caption=f"NautiCAI report: {vessel_id}")
