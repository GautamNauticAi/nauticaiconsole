"""
Persist inspection artifacts to GCS so PDF/JSON survive Cloud Run ephemeral disk.
Uses the Cloud Run metadata token (same pattern as download_models.sh).
"""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Optional

_GCS_RW_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write"
_GCS_RO_SCOPE = "https://www.googleapis.com/auth/devstorage.read_only"


def reports_bucket() -> Optional[str]:
    raw = (os.environ.get("GCS_REPORTS_BUCKET") or os.environ.get("GCS_MODEL_BUCKET") or "").strip()
    return raw or None


def reports_prefix() -> str:
    return (os.environ.get("GCS_REPORTS_PREFIX") or "reports").strip().strip("/")


def _object_key(user_id: int, filename: str) -> str:
    return f"{reports_prefix()}/{user_id}/{filename}"


def _metadata_token(scope: str) -> Optional[str]:
    q = urllib.parse.quote(scope, safe="")
    url = (
        "http://metadata.google.internal/computeMetadata/v1/"
        f"instance/service-accounts/default/token?scopes={q}"
    )
    req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8")).get("access_token")
    except Exception:
        return None


def _upload_bytes(bucket: str, object_name: str, data: bytes, content_type: str) -> bool:
    token = _metadata_token(_GCS_RW_SCOPE)
    if not token:
        return False
    enc = urllib.parse.quote(object_name, safe="")
    url = (
        f"https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o"
        f"?uploadType=media&name={enc}"
    )
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": content_type},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"[report_gcs] upload {object_name}: {e}")
        return False


def _download_bytes(bucket: str, object_name: str) -> Optional[bytes]:
    token = _metadata_token(_GCS_RO_SCOPE)
    enc = urllib.parse.quote(object_name, safe="")
    if token:
        url = f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{enc}?alt=media"
        headers = {"Authorization": f"Bearer {token}"}
    else:
        url = f"https://storage.googleapis.com/{bucket}/{object_name}"
        headers = {}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()
    except Exception as e:
        print(f"[report_gcs] download {object_name}: {e}")
        return None


def persist_vessel_reports(user_id: int, vessel_id: str, reports_folder: str) -> None:
    """Upload PDF + JSON (and annotated jpgs) for this vessel to GCS."""
    bucket = reports_bucket()
    if not bucket or not os.path.isdir(reports_folder):
        return
    uploaded = 0
    for name in os.listdir(reports_folder):
        if not name.startswith(f"{vessel_id}_"):
            continue
        if not (
            name.endswith(".pdf")
            or name.endswith(".json")
            or name.endswith(".jpg")
        ):
            continue
        path = os.path.join(reports_folder, name)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError as e:
            print(f"[report_gcs] read {path}: {e}")
            continue
        ctype = "application/pdf" if name.endswith(".pdf") else (
            "application/json" if name.endswith(".json") else "image/jpeg"
        )
        key = _object_key(user_id, name)
        if _upload_bytes(bucket, key, data, ctype):
            uploaded += 1
    if uploaded:
        print(f"[report_gcs] persisted {uploaded} file(s) for user={user_id} vessel={vessel_id}")


def sync_vessel_artifacts_to_local(user_id: int, vessel_id: str, reports_folder: str) -> None:
    """Download missing report files from GCS into reports_folder."""
    bucket = reports_bucket()
    if not bucket:
        return
    os.makedirs(reports_folder, exist_ok=True)
    candidates = [
        f"{vessel_id}_Audit_Report.pdf",
        f"{vessel_id}_inspection_data.json",
        f"{vessel_id}_annotated.jpg",
    ]
    for i in range(32):
        candidates.append(f"{vessel_id}_inspection_data_{i}.json")
        if i > 0:
            candidates.append(f"{vessel_id}_annotated_{i}.jpg")
    seen = set()
    for name in candidates:
        if name in seen:
            continue
        seen.add(name)
        dest = os.path.join(reports_folder, name)
        if os.path.isfile(dest):
            continue
        data = _download_bytes(bucket, _object_key(user_id, name))
        if not data:
            continue
        try:
            with open(dest, "wb") as f:
                f.write(data)
        except OSError as e:
            print(f"[report_gcs] write {dest}: {e}")
