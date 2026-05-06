# NautiCAI File-by-File Code Map (Connectivity + Responsibilities)

Purpose: Give a future agent enough structural awareness to implement features safely without breaking existing logic.

This map focuses on **active files in the current architecture** and explains how they connect.

---

## 1) Repository Topology (active + legacy)

From `NautiCAI/` root:

- `frontend/` -> Next.js UI (manual workflow + report views)
- `AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/` -> FastAPI + model engines + bot code
- `openclaw/` -> watcher automation
- `migrations/run_once_neon.sql` -> DB migration helper for auth/user schema
- `.env` + `.env.example` -> environment contract

Legacy/no longer core:
- `js/`, `css/` -> old static UI artifacts (not used by current Next app)
- `thirdparty/` -> removed intentionally (runtime is in-repo now)

---

## 2) Frontend Core Files

## 2.1 App routing layer (`frontend/src/app`)

### `layout.tsx`
- Root HTML layout + metadata.
- Loads global CSS.

### `page.tsx` (landing)
- Marketing homepage.
- Uses `Navbar` and routes to `/inspect` or `/login` based on token.

### `inspect/page.tsx`
- Manual upload entrypoint.
- Accepts images/videos, runs inspection.
- Calls:
  - `api.upload(...)` for single
  - `api.uploadBatch(...)` for multi
- Stores latest responses in `sessionStorage` for immediate results rendering.
- Writes demo NDT input via `saveNdtForVessel(...)`.

### `results/[id]/page.tsx`
- Detail page for one vessel batch/inspection.
- Data sources:
  - sessionStorage (`source=live`)
  - backend fetch (`/api/vessel/{id}/reports` or `/latest-report`)
- Supports multi-image slider (batch array).
- Fetches annotated image blob via API adapter.
- Shows NDT computed demo values.
- Downloads PDF through backend endpoint.

### `dashboard/page.tsx`
- High-level stats + recent inspections table.
- Fetches list via `api.listInspections()`.
- Uses improved anomaly and risk derivation:
  - `total_detections` first for count
  - `risk_score` first for risk badge
- Supports source filter (`all/hull/pipeline`).
- Supports delete action via backend delete endpoint.

### `reports/page.tsx`
- List-centric inspection history page.
- Same list source as dashboard.
- Uses:
  - anomaly count fallback chain (prefers `total_detections`)
  - severity fallback from `vision_severity` when anomaly list is unavailable
  - risk sorting by numeric `risk_score`

### `login/page.tsx`, `reset-password/page.tsx`
- Auth flows against backend auth endpoints.

### `learn/page.tsx`
- Informational/demo content page.

---

## 2.2 Frontend API + types + NDT

### `frontend/src/lib/api.ts` (**critical integration file**)
Single source for backend calls and data mapping.

Key responsibilities:
- Resolve backend base URL:
  - local: `NEXT_PUBLIC_API_URL` or localhost
  - prod browser: Next proxy `/api/backend`
- Apply auth header from localStorage token.
- Wrap requests and normalize errors.
- Inspection calls:
  - `upload`: `POST /api/inspect`
  - `uploadBatch`: `POST /api/inspect/batch`
- **Important current behavior**:
  - defaults `inspection_source="hull"` for manual uploads to match hull routing behavior
- Cache + list logic:
  - `listInspections` uses `/api/vessels/all`
  - maps `AgenticVessel` -> `Inspection` via `vesselToInspection`
- Data retrieval:
  - latest report, batch reports, annotated image blob URL, PDF download

### `frontend/src/types/index.ts`
- Type contracts for frontend + backend payloads.
- Important interfaces:
  - `AgenticInspectResponse`
  - `AgenticVessel`
  - `Inspection`
- Includes fields added for real list metrics:
  - `total_detections`
  - `vision_severity`
  - `risk_score`
  - `risk_level`
  - `total_hull_coverage_percentage`
  - `inspection_source`

### `frontend/src/lib/ndt.ts`
- Demo NDT logic (frontend only).
- Stores per-vessel NDT inputs + computed demo metrics in localStorage.
- Enriches inspection list rows client-side.
- Current demo loss function is constant 1.0% (placeholder).

### `frontend/src/lib/exportPdf.ts`
- Frontend PDF utility layer (for non-agentic path compatibility).

---

## 2.3 Frontend shared components

### `components/PageShell.tsx`
- Shared full-page shell with common background and fixed top nav.

### `components/Navbar.tsx`
- Global top navigation.
- Auth state from localStorage + `/auth/me`.
- Shows username pill (copy button).
- Logout clears auth and cached inspection list.

### `components/DeleteConfirmModal.tsx`
- Used by dashboard/reports delete action.

### `components/ImageViewerModal.tsx`, `PdfViewerModal.tsx`, `HullOrbit.tsx`, `ParticleField.tsx`
- Visual/helper components.

---

## 2.4 Frontend backend-proxy route

### `frontend/src/app/api/backend/[[...path]]/route.ts`
- Next.js server-side proxy.
- Forwards GET/POST/DELETE/OPTIONS to backend URL.
- Preserves authorization header.
- Handles JSON and binary passthrough (PDF/images).
- Reduces CORS friction in deployed environments.

---

## 3) Backend Core Files

Backend root:
`AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/`

### `nauticai_api.py` (**main backend orchestrator**)

Responsibilities:
- Load env from backend upward to repo root safely.
- Setup FastAPI, auth, CORS, endpoints.
- Execute inspection pipeline(s) through `nauticai_hull_inspection`.
- Generate report JSON + annotated images + PDF.
- Persist inspection rows (when DB available).
- Serve list/report/image/pdf endpoints.
- Telegram bot-facing endpoints:
  - `/api/telegram/validate`
  - `/api/telegram/latest-pdf`
  - `/api/telegram/latest-report`

Critical inspection endpoints:
- `POST /api/inspect`
- `POST /api/inspect/batch`

Critical list endpoint:
- `GET /api/vessels/all`
  - merges DB latest rows + filesystem-discovered reports
  - aggregates per-image JSON files for correct batch-level metrics

Critical recent safety behavior:
- `_http_inspection_telegram_notify_enabled(request)` gates `telegram_notify` pushes.
- Default mode `openclaw` => only requests with `X-NauticAI-Client: openclaw` trigger backend push notification.

### `nauticai_hull_inspection.py` (**router + agentic pipeline**)

Responsibilities:
- Defines engine routing by `inspection_source` + env:
  - hull default -> prasad
  - pipeline default -> aishwarya
  - fallback -> `NAUTICAI_HULL_ENGINE` (default agentic)
- Provides default agentic YOLO+SAM implementation.
- Handles video frame extraction and image processing utilities.
- Returns normalized `vision_report` consumed by API.

### `nauticai_prasad_engine.py` (**Prasad model implementation**)
- In-repo implementation of Prasad inference stack.
- Supports:
  - 5-model ONNX v2 specialist setup (preferred when all ONNX present)
  - legacy `.pt` / `.engine` fallback
- Resolves model folder via `NAUTICAI_PRASAD_MODEL_DIR` or alias `NAUTICAI_PRASAD_REPO`.
- Includes class remap/filters and optional ResNet species support.

### `nauticai_prasad_multimodel.py` (**Prasad wrapper**)
- Adapter returning report shape compatible with other engines.
- Used when routing selects `prasad`.

### `nauticai_aishwarya_engine.py` (**Aishwarya model implementation**)
- In-repo implementation of Aishwarya YOLO pipeline engine.
- Handles:
  - model discovery/selection
  - pipeline-specific key preferences
  - class remap and severity map
  - image enhancement steps
- Supports env for thresholds and enhancement tuning.

### `nauticai_aishwarya_pipeline.py` (**Aishwarya wrapper**)
- Wraps engine output into standard report structure.
- Computes pseudo coverage from detection boxes.
- Writes annotated image + JSON.

### `telegram_notify.py`
- Backend push notifier utility.
- Sends summary message and PDF document to configured `TELEGRAM_CHAT_ID`.
- Called from backend inspect endpoints conditionally.

### `nauticai_telegram_bot.py`
- Interactive Telegram bot process.
- Username validation and latest-report retrieval via backend APIs.
- Provides menu:
  - IMO rating scale
  - download latest report
  - about
- Includes conflict and network handling + lightweight health server for Cloud Run.

---

## 4) OpenClaw Automation Files

### `openclaw/watcher.py` (**automation control plane**)

Responsibilities:
- Load root `.env` and merge backend telegram env values.
- Determine directories for incoming, processed, failed.
- Watch filesystem for new media.
- Infer source (`hull`/`pipeline`) from path/tokens or config.
- Batch media by quiet period.
- Call backend `POST /api/inspect/batch` with:
  - files
  - vessel id
  - inspection source
  - auth header
  - **`X-NauticAI-Client: openclaw` header**
- Move/delete source files on completion.
- Emit watcher technical Telegram messages.
- Write audit log JSON lines.

Primary helper concepts:
- batch key modes (`vessel`, `global`)
- vessel id allocation strategy
- timeout recovery polling when backend batch call times out

### `openclaw/openclaw.yaml`
- Policy file used by watcher startup checks.
- Defines expected file permissions and network boundaries.

### `openclaw/nauticai-watcher.service`
- Systemd unit template for edge/Jetson auto-start.

### `openclaw/README.md`
- Operational instructions for watcher setup and run.

---

## 5) Environment and configuration files

### `NautiCAI/.env`
- Actual local runtime secrets/config (not committed).
- Used by backend and watcher.

### `NautiCAI/.env.example`
- Canonical config contract.
- Documents:
  - auth skip mode
  - OpenClaw settings
  - model routing settings
  - Prasad/Aishwarya model paths
  - Telegram behavior toggles
  - `NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT` semantics

### `NautiCAI/.gitignore` and repo root `.gitignore`
- Prevent accidental commit of env, artifacts, models (unless forced), caches, etc.

---

## 6) Database and migrations

### `migrations/run_once_neon.sql`
- SQL migration file for Neon/Postgres setup.
- Includes table/column requirements for auth and app flows.

### `PROJECT_FLOW_AND_DB.md`
- Older DB flow note (contains historical pre-agentic references; use with caution).

---

## 7) Deployment and ops docs

### `DEPLOY.md`
- Cloud deployment guidance (backend + bot + frontend integration).

### `PRODUCTION_CHECKLIST.md`
- Production hardening checklist.

### `RUN_AGENTIC.md`, `APP_FLOW.md`, `MODEL_INTEGRATION.md`, `MODEL_FILES_SETUP.md`, `AGENTIC_AI_INTEGRATION.md`
- Mixed-era documentation.
- Some content is legacy/pre-current architecture.
- Use `AGENT_TRANSFER_PROJECT_MEMORY.md` + this file as primary truth for current behavior.

---

## 8) Runtime storage folders and what they mean

At `NautiCAI/` root:
- `incoming/` -> watcher input folder
- `processed/` -> watcher success archive
- `failed/` -> watcher failure archive
- `pipeline_outputs/` -> intermediate model artifacts (engine output area)

Inside backend folder:
- `reports/{user_id}/` -> persistent report JSON/PDF/annotated files for authenticated user
- `temp_uploads/` -> temporary uploaded files
- `pipeline_outputs/` -> backend-level output artifacts
- `prasad_models/`, `aishwarya_models/`, `sam_checkpoints/` -> model assets

---

## 9) Connection map (who calls whom)

Manual UI path:
- `inspect/page.tsx` -> `lib/api.ts` -> backend `/api/inspect*` -> `nauticai_hull_inspection.process_image(...)` -> specific engine wrapper.

Results path:
- `results/[id]/page.tsx` -> `api.getAgenticReportBatch/getAgenticReport` -> backend report endpoints.

List pages path:
- `dashboard/page.tsx` and `reports/page.tsx` -> `api.listInspections()` -> backend `/api/vessels/all`.

Automation path:
- `openclaw/watcher.py` -> backend `/api/inspect/batch`.

Bot path:
- `nauticai_telegram_bot.py` -> backend `/api/telegram/*`.

Backend push notification:
- backend inspect endpoints -> `telegram_notify.send_inspection_result(...)` if gating function allows.

---

## 10) High-risk files (edit with extra care)

1. `frontend/src/lib/api.ts`
   - Tiny changes can alter routing/auth/cache/inspection source behavior.

2. `nauticai_api.py`
   - Touches auth, storage, endpoints, notifications, and report schema.

3. `nauticai_hull_inspection.py`
   - Core routing and model engine choice.

4. `openclaw/watcher.py`
   - Live automation behavior + failure handling.

5. `nauticai_prasad_engine.py` and `nauticai_aishwarya_engine.py`
   - Model loading conventions and domain logic.

---

## 11) Known legacy references / cleanup notes

- `js/` and `css/` at `NautiCAI/` root are legacy static UI assets.
- Root `package-lock.json` (outside `frontend/`) is orphaned because active package is in `frontend/package.json`.
- Keep this in mind when cleaning repository structure.

---

## 12) Practical implementation guardrails for future features

When implementing new feature:
1. Update `types/index.ts` first if response schema changes.
2. Update backend response and list mapping together:
   - backend `/api/vessels/all`
   - frontend `vesselToInspection(...)`.
3. Preserve `inspection_source` propagation from clients.
4. Re-run backend syntax check after Python edits:
   - `python -m py_compile nauticai_api.py`
5. Run lint on changed frontend files.
6. Verify:
   - manual inspect
   - dashboard/report row metrics
   - pdf download
   - watcher automation (if touched)
   - telegram behavior (if touched)

---

## 13) Minimal "what is what" dictionary for future agent prompts

- "Prasad model" => `nauticai_prasad_engine.py` stack (hull-focused, 5 ONNX preferred).
- "Aishwarya model" => `nauticai_aishwarya_engine.py` + `nauticai_aishwarya_pipeline.py` (pipeline-focused).
- "Agentic model" => YOLO+SAM in `nauticai_hull_inspection.py`.
- "Automation feature" => `openclaw/watcher.py` and associated folders/policy.
- "Telegram bot flow" => `nauticai_telegram_bot.py` interactive username-validated menu.
- "Telegram auto summary/pdf push" => `telegram_notify.py` from backend inspect endpoints.
- "Demo NDT fields" => frontend localStorage enrichment via `lib/ndt.ts`.

