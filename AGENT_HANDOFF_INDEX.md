# NautiCAI Agent Handoff Index

Start here on a new laptop. This file points to everything in the right order.

---

## Read Order (important)

1. `AGENT_FIRST_DAY_CHECKLIST.md`  
   - Quick setup + smoke tests + safety invariants
2. `AGENT_TRANSFER_PROJECT_MEMORY.md`  
   - Full product/history/behavior memory
3. `AGENT_TRANSFER_FILE_MAP.md`  
   - File-by-file code relevance and connectivity

---

## 60-Second Quickstart

## Backend

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\AgenticAI_Backend\NautiCAI AI\NautiCAI_Backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python nauticai_api.py
```

## Frontend

```powershell
cd "c:\Users\chara\Documents\NauticAi_Frontend\NautiCAI\frontend"
npm install
npm run dev
```

Open:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`

---

## Core Runtime Components

- Manual app UI: `frontend/`
- Backend API + model routing: `AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/`
- Automation watcher: `openclaw/watcher.py`
- Interactive Telegram bot: `nauticai_telegram_bot.py`
- Backend push notifier: `telegram_notify.py`

---

## Non-Negotiable Invariants

1. Manual upload should send `inspection_source=hull` by default.
2. OpenClaw should send header `X-NauticAI-Client: openclaw`.
3. Backend inspect Telegram push is gated by `NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT` (default `openclaw`).
4. `/api/vessels/all` must keep DB + filesystem merge and batch aggregation logic.
5. Dashboard/Reports should use real fields (`total_detections`, `vision_severity`, `risk_score`) not placeholders.

---

## Primary Config File

- `.env` in `NautiCAI/` (local secrets/runtime)
- `.env.example` is the canonical variable reference

---

## If Something Looks Wrong

- Empty Dashboard/Reports but inspect works -> check DB connectivity and `/api/vessels/all`.
- Wrong engine/model selected -> verify `inspection_source` and routing env vars.
- Manual inspect sending Telegram unexpectedly -> check `NAUTICAI_TELEGRAM_NOTIFY_HTTP_INSPECT`.
- OpenClaw not processing -> verify watched folders, token, and watcher logs.

---

This index is intentionally short. Use the three transfer documents for full context.

