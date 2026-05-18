# NautiCAI Project Transfer Memory (High-Context Handoff)

This file is a durable memory artifact for future agents and developers moving to a new laptop/environment.

It captures:

- Product intent
- Architecture and runtime behavior
- Historical evolution (manual -> automation -> multi-model routing)
- Current invariants and "do not break" rules
- How to run end-to-end
- Deployment context and practical troubleshooting

---

## 1) Product Definition (What NautiCAI is)

NautiCAI is an AI-assisted maritime inspection platform with two operating modes:

1. **Manual mode (web app)**
  User uploads image(s)/video from Inspect page -> backend runs AI -> results page + report list + PDF.
2. **Automation mode (OpenClaw watcher)**
  A folder watcher monitors incoming ROV media -> batches and sends to backend -> stores reports -> optional Telegram automation notifications.

Primary outputs per inspection:

- AI detections
- Severity
- Coverage percentage
- Compliance result (IMO style rating + recommended action + requires_cleaning)
- Risk score / risk level in list surfaces
- Annotated image(s)
- PDF report

---

## 2) Key Terminology (Must understand exactly)

- **Agentic engine**: YOLO + SAM path in `nauticai_hull_inspection.py` (`engine: agentic_yolo_sam`).
- **Prasad model / Prasad stack**: Multi-model hull inference in `nauticai_prasad_engine.py` and wrapper `nauticai_prasad_multimodel.py`.  
  - Preferred path is 5-model ONNX v2 if all ONNX models exist.
- **Aishwarya model**: Pipeline-focused YOLO path in `nauticai_aishwarya_engine.py` + wrapper `nauticai_aishwarya_pipeline.py` (`engine: aishwarya_yolov8_nauticai`).
- **inspection_source**: Crucial routing tag (`hull` or `pipeline`) sent in API form data.
- **OpenClaw**: Folder automation watcher (`openclaw/watcher.py`).
- **Telegram bot**: Interactive user-facing bot (`nauticai_telegram_bot.py`), username-gated options.
- **telegram_notify**: Backend push notifier module sending summary + PDF to configured `TELEGRAM_CHAT_ID`.
- **Demo NDT**: Frontend-only localStorage enrichment for thickness demo fields (`frontend/src/lib/ndt.ts`), not persisted in backend DB.

---

## 3) Historical Evolution (Why code looks this way)

### Phase A - Manual inspection foundation

- Inspect page uploaded media to backend `/api/inspect`.
- Results page rendered latest response.
- Dashboard and Reports listed inspections and offered Results/PDF.

### Phase B - Telegram bot (interactive)

- User enters username in bot.
- Username is validated via backend DB endpoint.
- Bot options:
  - About NautiCAI
  - View IMO scale
  - Download latest report PDF

### Phase C - Video support and batch support

- `/api/inspect` supports single file that may be image or video; video gets frame extraction.
- `/api/inspect/batch` added for multi-file processing in one request for cloud consistency.

### Phase D - Demo NDT fields

- Added NDT fields in Inspect UI.
- NDT calculations are demo-only and stored client-side.
- Dashboard/Reports/Results show enriched NDT values.

### Phase E - Automation (OpenClaw watcher)

- Watcher monitors folder(s), groups files into quiet-window batches, posts to backend batch endpoint.
- Moves files to processed/failed (or delete after processing if configured).
- Writes audit log and optional Telegram technical notifications.

### Phase F - Multi-model routing integration

- Routing by source tag:
  - Hull -> default Prasad
  - Pipeline -> default Aishwarya
  - Fallback via `NAUTICAI_HULL_ENGINE`
- Backend consolidated to in-repo engine modules (no external thirdparty runtime dependency).

### Phase G - Recent critical fixes (important)

1. **Reports list robustness**: merge DB + filesystem report discovery so rows still appear even if DB insert fails.
2. **Real metrics in lists**: anomaly count, severity, risk in dashboard/reports now map from backend fields (`total_detections`, `vision_severity`, `risk_score`).
3. **Batch aggregation**: backend now aggregates per-image JSON payloads for list rows (sum detections, max severity/coverage, any requires_cleaning).
4. **Manual routing alignment**: frontend manual upload now sends `inspection_source=hull` by default so manual hull behavior matches automation hull routing.
5. **Telegram noise control**: manual inspect should not notify ops chat by default.
  Controlled by `NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT` + OpenClaw header `X-NauticAI-Client: openclaw`.
6. **thirdparty folder removed**: reference-only folder removed from workspace; runtime unaffected.

---

## 4) Current Architecture (As of transfer)

### Frontend (Next.js)

Location: `NautiCAI/frontend`

Core routes:

- `/inspect`
- `/results/[id]`
- `/dashboard`
- `/reports`
- `/login`
- `/reset-password`

The frontend uses `src/lib/api.ts` as canonical API adapter.

### Backend (FastAPI)

Location: `NautiCAI/AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend`

Primary server: `nauticai_api.py`

Major responsibilities:

- Auth/session endpoints
- Inspection endpoints (single and batch)
- Report file generation/access (JSON, annotated image, PDF)
- Telegram username validation endpoints for bot
- Vessel list endpoint for Dashboard/Reports

### Automation watcher

Location: `NautiCAI/openclaw/watcher.py`

Responsibilities:

- Watch folders
- Batch by quiet period
- Infer source
- Trigger backend batch inspect endpoint
- Move/delete files post-processing
- Write audit log
- Send technical Telegram alerts

### Telegram subsystems

1. `nauticai_telegram_bot.py` interactive bot (user pull model)
2. `telegram_notify.py` push notifier used by backend inspect endpoints (ops push model)
3. Watcher `send_telegram` technical alerts (ops system model)

---

## 5) Routing and model behavior (critical invariants)

Engine selection happens in `nauticai_hull_inspection.engine_for_source(...)`:

- `inspection_source = hull` -> default `NAUTICAI_HULL_FOLDER_ENGINE` (default `prasad`)
- `inspection_source = pipeline` -> default `NAUTICAI_PIPELINE_FOLDER_ENGINE` (default `aishwarya`)
- no source tag -> fallback `NAUTICAI_HULL_ENGINE` (default `agentic`)

### Why this matters

If a client omits `inspection_source`, it can unintentionally use fallback engine.
Manual web inspect now explicitly sets `inspection_source=hull` to avoid drift from automation behavior.

---

## 6) Data flow summaries

### Manual single image flow

1. Inspect page -> `api.upload(...)` (or `runAgenticInspection`)
2. Frontend sends `POST /api/inspect` with:
  - `vessel_id`
  - `image`
  - `inspection_source=hull` (default)
  - optional NDT fields (frontend currently for future compatibility)
3. Backend processes and saves:
  - `reports/{user_id}/{vessel_id}_inspection_data.json`
  - per-image file `_inspection_data_{index}.json`
  - annotated jpg
  - PDF
4. Frontend stores report in sessionStorage and navigates to `/results/{id}?source=live`.

### Manual multi image flow

1. Inspect page -> `api.uploadBatch(...)`
2. Frontend sends `POST /api/inspect/batch` with `images[]`, `vessel_id`, `inspection_source`.
3. Backend processes all items in one request.
4. Combined PDF generated.
5. Results page can render slider.

### OpenClaw automation flow

1. New files arrive in incoming directory/directories.
2. Watcher groups files by batch policy after quiet period.
3. Watcher posts to `/api/inspect/batch` with `inspection_source` inferred or configured.
4. Watcher adds header `X-NauticAI-Client: openclaw`.
5. Backend saves reports and files.
6. Watcher moves/deletes source files, writes audit lines, sends optional technical notifications.

---

## 7) Telegram behavior model (must keep clean)

There are three Telegram channels of behavior:

1. **Interactive bot (`nauticai_telegram_bot.py`)**
  - User enters username.
  - Backend validates username.
  - Bot presents menu and serves latest PDF on demand.
  - This is user pull/self-service.
2. **Backend push (`telegram_notify.py` called from `/api/inspect`*)**
  - Sends summary + PDF to `TELEGRAM_CHAT_ID`.
  - Now gated by:
    - `NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT=openclaw` (default)
    - header `X-NauticAI-Client: openclaw`
  - Effect: manual browser inspect does not spam ops chat by default.
3. **Watcher technical alerts**
  - Online/offline/back-end down/failure notices.
  - Optional success summaries (`OPENCLAW_NOTIFY_SUCCESS`).

### Control env

- `NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT`
  - `openclaw` (default)
  - `off`
  - `all`

---

## 8) Auth model and practical note

- Production uses session token from DB (`auth_sessions` table).
- Local development can bypass with `NAUTICAI_SKIP_AUTH=1`.
- OpenClaw uses `OPENCLAW_API_TOKEN` bearer token; when skip auth is off, this token should belong to the same user context you expect for reports.

---

## 9) Risk / anomaly / severity logic in list surfaces

### Backend list row from report payloads includes:

- `total_detections`
- `vision_severity`
- `total_hull_coverage_percentage`
- `risk_score`
- `risk_level`
- `image_count`
- `inspection_source`

### Frontend list columns now prefer backend truth:

- anomaly count: `total_detections` first
- severity: anomaly-derived severity, fallback to `vision_severity`
- risk: `risk_score` first, fallback heuristic if absent

---

## 10) Runbook (new laptop quick start)

## 10.1 Repo and Python/Node setup

1. Install:
  - Python 3.10+ (project tested in 3.10/3.11 range)
  - Node 18+
2. Open repo root:
  - `c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI`

## 10.2 Backend setup (Windows PowerShell)

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\AgenticAI_Backend\NautiCAI AI\NautiCAI_Backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python nauticai_api.py
```

Backend URL: `http://localhost:8000`
Docs: `http://localhost:8000/docs`

## 10.3 Frontend setup

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\frontend"
npm install
npm run dev
```

Frontend URL: `http://localhost:3000`

## 10.4 Optional OpenClaw watcher

Run from repo root (`NautiCAI`):

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI"
pip install -r openclaw\requirements.txt
python openclaw\watcher.py
```

## 10.5 Optional Telegram bot

Standalone:

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\AgenticAI_Backend\NautiCAI AI\NautiCAI_Backend"
python nauticai_telegram_bot.py
```

Or auto-start with backend:

- set `NAUTICAI_START_TELEGRAM_BOT=1`
- run `python nauticai_api.py`

---

## 11) Required assets and model folders

Backend needs model assets in expected locations unless env overrides are set.

Important defaults:

- Agentic YOLO: `biofouling_best.pt`
- SAM checkpoint: `sam_checkpoints/sam_vit_b_01ec64.pth`
- Prasad models: `prasad_models/`
- Aishwarya models: `aishwarya_models/`

If files are moved, set corresponding env variables (`NAUTICAI_*_MODEL_*`).

---

## 12) Deployment memory (Cloud + edge)

Known deployment pattern used in this project:

- Frontend on Vercel
- Backend API on Cloud Run
- Telegram bot optionally separate Cloud Run service

Also there was an edge Ubuntu/server setup done via TeamViewer session with manager credentials.

Important note:

- **Credentials should not be stored in repo or docs.**
- Recreate environment by documenting host-level packages, service units, and env files securely outside git.

For infra-specific steps see:

- `DEPLOY.md`
- `PRODUCTION_CHECKLIST.md`
- `openclaw/nauticai-watcher.service`

---

## 13) Known pitfalls and anti-regressions

1. **Do not remove `inspection_source` tagging in frontend upload paths.**
  - It will change routing behavior.
2. **Do not reintroduce blanket telegram notifications for manual inspect unless product wants it.**
  - Manual testing gets noisy quickly.
3. **Do not assume DB insert success for reports listing.**
  - Keep filesystem discovery merge behavior.
4. **Do not drop batch aggregation logic in `get_all_vessels`.**
  - Without it, detections/risk can look wrong for multi-image runs.
5. **NDT fields are currently demo-level frontend enrichment.**
  - Avoid presenting as persisted/calibrated sensor analytics.
6. **OpenClaw and manual inspect are intentionally different entrypoints but should converge in backend report schema.**
7. `**thirdparty/` folder is intentionally removed.**
  - Runtime is fully in-repo for Prasad/Aishwarya engines.

---

## 14) Product narrative for stakeholders

Suggested explanation:

- Manual mode is for controlled, analyst-driven inspection.
- Automation mode is for operations-scale continuous ingestion.
- Same backend schema, same report surfaces, same PDF output.
- Multi-model routing enables source-specific model specialization:
  - Hull: Prasad stack
  - Pipeline: Aishwarya stack
- Telegram split:
  - user pull via bot
  - ops push for automation health/results

---

## 15) Fast checklist for future agent before major edits

1. Confirm target flow:
  - manual inspect?
  - watcher automation?
  - bot flow?
2. Confirm routing fields:
  - `inspection_source` present where expected?
3. Confirm list metrics:
  - anomaly count/risk/severity deriving from latest backend row fields.
4. Confirm telegram behavior:
  - manual should remain quiet unless explicitly configured otherwise.
5. Validate after edits:
  - backend syntax (`python -m py_compile nauticai_api.py`)
  - frontend lint for changed files
  - quick manual run + dashboard/reports check

---

## 16) Ownership intent for next agent

Future agent should treat this project as:

- A production-bound maritime inspection product with active operations concerns.
- Not just model inference; UX consistency and notification hygiene matter.
- Stability and backwards compatibility are important because flows are interconnected.

When uncertain, prioritize:

1. preserving current working flows,
2. making behavior explicit via env and headers,
3. avoiding silent behavioral drift between manual and automation paths.

