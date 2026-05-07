# NautiCAI Agent First-Day Checklist

Use this file when a new agent starts with zero context.  
Read this first, then expand into:
- `AGENT_TRANSFER_PROJECT_MEMORY.md`
- `AGENT_TRANSFER_FILE_MAP.md`

---

## 0) Mission

Get the stack running safely, verify all critical flows, and avoid regressions in:
- Manual inspect
- Dashboard/Reports correctness
- PDF generation
- Telegram behavior split (interactive bot vs automation notifications)
- OpenClaw automation
- Model routing (Hull=Prasad, Pipeline=Aishwarya by source tag)

---

## 1) Fast Bootstrap (Windows)

## 1.1 Backend

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\AgenticAI_Backend\NautiCAI AI\NautiCAI_Backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python nauticai_api.py
```

Backend expected:
- URL: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`

## 1.2 Frontend

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\frontend"
npm install
npm run dev
```

Frontend expected:
- URL: `http://localhost:3000`

## 1.3 Optional watcher

From `NautiCAI/` root:

```powershell
pip install -r openclaw\requirements.txt
python openclaw\watcher.py
```

## 1.4 Optional Telegram bot

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\AgenticAI_Backend\NautiCAI AI\NautiCAI_Backend"
python nauticai_telegram_bot.py
```

---

## 2) Required Smoke Tests (do in this order)

1. **Health check**
   - Open `http://localhost:8000/health`
   - Confirm backend alive.

2. **Manual inspect single image**
   - Inspect page upload one image.
   - Confirm Results page loads.
   - Confirm annotated preview + summary cards.

3. **PDF**
   - Click Download PDF on Results.
   - Confirm PDF opens/downloads successfully.

4. **Dashboard row correctness**
   - Open Dashboard and Reports.
   - Confirm row has non-placeholder metrics:
     - anomaly count from `total_detections`
     - risk score from backend field when available
     - severity fallback from `vision_severity` if needed

5. **Batch inspect**
   - Upload multiple images in Inspect.
   - Confirm Results slider appears and image index changes.

6. **Delete action**
   - Delete one inspection from Dashboard or Reports.
   - Confirm row disappears and files are removed for that vessel.

7. **Telegram behavior split**
   - Manual inspect should **not** push to ops chat by default (`NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT=openclaw`).
   - OpenClaw-triggered inspect may notify (header-gated).

---

## 3) Critical Invariants (Do Not Break)

1. Keep manual upload sending `inspection_source=hull` by default in frontend API layer.
2. Keep OpenClaw sending `X-NauticAI-Client: openclaw` header.
3. Keep backend inspect notification gating function intact.
4. Keep `/api/vessels/all` report-file merge + batch aggregation logic.
5. Do not remove type fields used in list mapping:
   - `total_detections`
   - `vision_severity`
   - `risk_score`
   - `risk_level`
   - `inspection_source`

---

## 4) Where to edit for common tasks

- **Manual upload behavior**: `frontend/src/lib/api.ts`, `frontend/src/app/inspect/page.tsx`
- **List row fields/stats**: `frontend/src/lib/api.ts`, `frontend/src/app/dashboard/page.tsx`, `frontend/src/app/reports/page.tsx`
- **Result detail page**: `frontend/src/app/results/[id]/page.tsx`
- **Backend inspect/report logic**: `nauticai_api.py`
- **Engine routing and source behavior**: `nauticai_hull_inspection.py`
- **Prasad model logic**: `nauticai_prasad_engine.py`
- **Aishwarya model logic**: `nauticai_aishwarya_engine.py`, `nauticai_aishwarya_pipeline.py`
- **Automation watcher behavior**: `openclaw/watcher.py`
- **Interactive Telegram bot**: `nauticai_telegram_bot.py`

---

## 5) Pre-commit safety checks after edits

## Python

```powershell
python -m py_compile "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\AgenticAI_Backend\NautiCAI AI\NautiCAI_Backend\nauticai_api.py"
```

## Frontend

- Run lint for touched TS/TSX files.
- Re-test inspect -> results -> dashboard/reports in browser.

---

## 6) Troubleshooting quick matrix

- **401 from inspect endpoints**
  - Auth token missing/invalid for backend mode.
  - Use valid browser token for OpenClaw `OPENCLAW_API_TOKEN`, or local skip-auth mode if intentionally enabled.

- **Dashboard/Reports empty but inspect works**
  - DB insert/query issue; inspect still writes report files.
  - Verify `/api/vessels/all` and DB connectivity.

- **Wrong model used**
  - Missing/incorrect `inspection_source`, or env routing variables misconfigured.

- **Manual inspect sends Telegram unexpectedly**
  - Check `NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT`; set `openclaw` or `off`.

- **OpenClaw not detecting files**
  - Wrong watch folder env path, unsupported extension, or policy/startup failure.

---

## 7) Read next

After this checklist:
1. `AGENT_TRANSFER_PROJECT_MEMORY.md` (full product + timeline memory)
2. `AGENT_TRANSFER_FILE_MAP.md` (deep file responsibility and connections)

