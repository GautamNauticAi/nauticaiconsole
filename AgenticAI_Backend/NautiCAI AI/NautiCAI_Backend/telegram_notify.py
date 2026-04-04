# NautiCAI – send inspection results to Charan (or any configured chat) via Telegram
# Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in env. If unset, no messages are sent.

import os
import urllib.request
import json
from typing import Any, Dict, List

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

def _normalize_payloads(report_payload_or_payloads: Any) -> List[Dict[str, Any]]:
    if isinstance(report_payload_or_payloads, list):
        return [p for p in report_payload_or_payloads if isinstance(p, dict)]
    if isinstance(report_payload_or_payloads, dict):
        return [report_payload_or_payloads]
    return []


def send_inspection_result(vessel_id: str, report_payload: Any, pdf_path: str = None):
    """
    Notify Telegram (Charan) when an inspection completes.
    Call this from the API after POST /api/inspect succeeds.
    Requires env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
    """
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        return

    payloads = _normalize_payloads(report_payload)
    if not payloads:
        return

    metrics_list = [p.get("ai_vision_metrics", {}) for p in payloads]
    compliance_list = [p.get("compliance_result", {}) for p in payloads]
    meta_last = payloads[-1].get("metadata", {})
    n = len(payloads)

    coverages = [
        float(m.get("total_hull_coverage_percentage", 0) or 0)
        for m in metrics_list
    ]
    detections = [
        int(m.get("total_detections", 0) or 0)
        for m in metrics_list
    ]
    needs_cleaning = [bool(c.get("requires_cleaning", False)) for c in compliance_list]
    avg_coverage = round(sum(coverages) / max(1, len(coverages)), 2)
    total_detections = sum(detections)
    any_critical = any(needs_cleaning)
    status = "🔴 CRITICAL – immediate action" if any_critical else "🟢 ACCEPTABLE"

    # Prefer the highest FR value as the batch headline.
    ratings = [str(c.get("official_imo_rating", "") or "") for c in compliance_list]
    def _rating_key(r: str) -> int:
        try:
            if r.upper().startswith("FR-"):
                return int(r.split("-", 1)[1].split()[0])
        except Exception:
            pass
        return -1
    headline_rating = ""
    if ratings:
        headline_rating = max(ratings, key=_rating_key)
    headline_action = ""
    for c in compliance_list:
        action = str(c.get("recommended_action", "") or "").strip()
        if action:
            headline_action = action
            if bool(c.get("requires_cleaning", False)):
                break
    ts = meta_last.get("inspection_timestamp", "")

    text = (
        f"<b>NautiCAI – batch inspection complete</b>\n\n"
        f"<b>Vessel:</b> {vessel_id}\n"
        f"<b>Time:</b> {ts}\n"
        f"<b>Images processed:</b> {n}\n"
        f"<b>Avg hull coverage:</b> {avg_coverage}%\n"
        f"<b>Total detections:</b> {total_detections}\n"
        f"<b>Batch IMO headline:</b> {headline_rating}\n"
        f"<b>Status:</b> {status}\n"
        f"<b>Action:</b> {headline_action}\n"
    )
    _send_message(token, chat_id, text)
    if pdf_path and os.path.isfile(pdf_path):
        suffix = f" ({n} image{'s' if n != 1 else ''})"
        _send_document(token, chat_id, pdf_path, caption=f"NautiCAI report: {vessel_id}{suffix}")
