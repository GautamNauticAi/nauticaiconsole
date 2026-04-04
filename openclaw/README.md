# OpenClaw — folder auto-inspection

Watches a directory for new images/videos and calls `POST /api/inspect/batch` on the Agentic backend.

## 1. Configure

From the **NautiCAI repo root** (this folder’s parent), set variables in **`../.env`** (or export in shell):

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | No | Default `http://127.0.0.1:8000` |
| `OPENCLAW_API_TOKEN` | Yes* | `Bearer` JWT (same as frontend after login) |
| `OPENCLAW_INCOMING_DIR` | No | Folder to watch; default `<repo>/incoming` |
| `OPENCLAW_PROCESSED_DIR` | No | Default `<repo>/processed` |
| `OPENCLAW_FAILED_DIR` | No | Default `<repo>/failed` |

\*If your API requires auth on `/api/inspect/batch`.

## 2. Install deps

```bash
pip install -r openclaw/requirements.txt
```

## 3. Run (backend must already be up)

**Linux / Jetson**

```bash
cd /path/to/NautiCAI
python3 openclaw/watcher.py
```

**Windows (PowerShell)** — same repo root (`NautiCAI` folder that contains `openclaw/`):

```powershell
cd C:\Users\You\Documents\NauticAi_Frontend\NautiCAI
pip install -r openclaw\requirements.txt
python openclaw\watcher.py
```

Use **`OPENCLAW_INCOMING_DIR=C:/Users/You/Downloads/Check`** in `NautiCAI\.env` (forward slashes). Create the **`Check`** folder before dropping files.

## 4. Test

1. Copy a `.jpg` into the incoming folder (e.g. `incoming/` or your `OPENCLAW_INCOMING_DIR`).
2. Wait **~10 seconds** after the last file (batch quiet window).
3. File should move to `processed/` or `failed/`.
4. Check `openclaw/watcher.log` and the Dashboard for the vessel (name derived from filename; see `extract_vessel_id` in `watcher.py`).

## Notes

- **Frontend** does not need to run for the watcher; only the **FastAPI backend**.
- Policy file **`openclaw/openclaw.yaml`** must exist or the watcher exits.
- Filename convention for vessel id: e.g. `MV_TEST_20260403_001.jpg` → vessel `MV_TEST`.
