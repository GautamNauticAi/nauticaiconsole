# NautiCAI – Backend & deployment

Single backend: **AgenticAI_Backend** (auth, inspect, dashboard, reports, Telegram).

**Ready for deployment:** 2 services on **Google Cloud Run** (Backend API + Telegram bot) + 1 app on **Vercel** (frontend). See **Option B** and **PRODUCTION_CHECKLIST.md**.

---

## Deploy now (backend + connect everything)

Do these in order. Replace placeholders with your real values.

### 1. Include YOLO model in the build

`biofouling_best.pt` is already in the backend folder; it’s gitignored (`*.pt`) so Cloud Build doesn’t get it. From repo root, add it once and push:

```bash
git add -f "AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/biofouling_best.pt"
git commit -m "Include YOLO model for Cloud Run build"
```

### 2. Build backend image on Google Cloud

- Push your branch to GitHub (e.g. `main`).
- **Google Cloud Console** → **Cloud Build** → **History** → **Submit build** (or use your trigger).
  - **Source:** GitHub, your repo, branch (e.g. `main`).
  - **Build configuration:** Cloud Build configuration file.
  - **Location:** Repository; path: **`cloudbuild-api.yaml`** (at repo root).
- Submit. First build can take **~20–25 min** (torch + segment-anything). Wait until it succeeds.

### 3. Deploy backend to Cloud Run

- **Cloud Run** → **Create Service** (or select existing).
- **Container:**  
  - **Image:** `gcr.io/YOUR_GCP_PROJECT_ID/nauticai-api:COMMIT_SHA`  
  (use the image built in step 2; pick the correct tag from Container Registry).
- **Port:** `8080`.
- **Environment variables** (add these):

  | Name | Value |
  |------|--------|
  | `POSTGRES_DSN` | Your Neon connection string (from Neon dashboard) |
  | `JWT_SECRET` | Your production secret (e.g. the 64-char hex you generated) |
  | `FRONTEND_URL` | Your Vercel app URL (e.g. `https://nauticaiconsole.vercel.app`) |

- Create/Deploy. Copy the **service URL** (e.g. `https://nauticai-api-xxxx.run.app`). This is your **backend URL**.

### 4. Connect frontend (Vercel)

- **Vercel** → your project → **Settings** → **Environment Variables**.
- Set **`NEXT_PUBLIC_API_URL`** = **backend URL** from step 3 (no trailing slash).
- **Redeploy** the frontend so the new value is used.

### 5. Connect Telegram bot (Option B)

- **Cloud Run** → open your **Telegram bot** service.
- **Edit & deploy new revision** → **Variables**:
  - **`TELEGRAM_VALIDATE_URL`** = **backend URL** from step 3 (e.g. `https://nauticai-api-xxxx.run.app`).
- Deploy.  
If the bot isn’t deployed yet: deploy with **Dockerfile.bot**, set **`TELEGRAM_BOT_TOKEN`** and **`TELEGRAM_VALIDATE_URL`** = backend URL, **Minimum instances = 1**.

---

After this: **Frontend (Vercel)** talks to **Backend (Cloud Run)** via `NEXT_PUBLIC_API_URL`. **Bot (Cloud Run)** talks to **Backend** via `TELEGRAM_VALIDATE_URL`. **Backend** uses **Neon** via `POSTGRES_DSN`. All services are connected.

---

## Backend (required)

- **Location:** `NautiCAI/AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/`
- **Entry point:** `nauticai_api.py`
- **Endpoints:** `/auth/signup`, `/auth/login`, `/auth/me`, `/api/inspect`, `/api/vessels/all`, `/api/vessel/{id}/latest-report`, `/api/vessel/{id}/pdf`, `/api/telegram/validate`, `/health`

The frontend uses `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) to talk to this backend.

---

## Run locally

**Backend**

```bash
cd "NautiCAI/AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend"
pip install -r requirements.txt
python nauticai_api.py
```

With Telegram bot auto-started (set in `.env`):

```bash
# In .env: NAUTICAI_START_TELEGRAM_BOT=1
python nauticai_api.py
```

**Frontend**

```bash
cd NautiCAI/frontend
npm run dev
```

Backend: **http://localhost:8000** | Docs: **http://localhost:8000/docs** | Frontend: **http://localhost:3000**

---

## Model files

Put in the backend folder (same folder as `nauticai_api.py`):

- `biofouling_best.pt`
- `sam_checkpoints/sam_vit_b_01ec64.pth`

See **MODEL_FILES_SETUP.md**.

---

## Deploy (e.g. Google Cloud Run)

1. Use **`AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/`** as the build context.
2. Dockerfile: install deps from `requirements.txt`, copy app + models, run `uvicorn nauticai_api:app --host 0.0.0.0 --port ${PORT}`.
3. Set env (POSTGRES_DSN, TELEGRAM_BOT_TOKEN, etc.) in Cloud Run.
4. Point the frontend’s `NEXT_PUBLIC_API_URL` to the service URL.

---

## Telegram bot 24/7 (no “restart to wake”)

The bot uses **long polling**: it must run continuously to receive `/start` and other commands. If the backend scales to zero or sleeps, the bot stops. Two ways to keep it 24/7:

### Option A – One service, always on

- Run the **backend** so the bot starts inside the same process:
  - **Container command:** `python nauticai_api.py` (not `uvicorn`).
  - **Env:** `NAUTICAI_START_TELEGRAM_BOT=1`, `TELEGRAM_BOT_TOKEN`, `POSTGRES_DSN`, etc.
- In Cloud Run set **Minimum instances = 1** so the container never scales to zero.
- One deployment; every new deploy gets the latest backend + bot. You pay for one always-on instance (heavier image with torch/YOLO/SAM).

### Option B – Separate bot service (recommended)

- **Backend:** Deploy as today (uvicorn, can scale to zero). No bot in this container.
- **Bot:** Deploy a **second** Cloud Run service that only runs the bot 24/7:
  1. **Build context:** same folder `AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/`.
  2. **Dockerfile:** use `Dockerfile.bot` (lightweight: no torch/SAM).
     ```bash
     docker build -f Dockerfile.bot -t nauticai-bot .
     ```
  3. **Container command:** `python -u nauticai_telegram_bot.py` (default in Dockerfile.bot).
  4. **Env:**
     - `TELEGRAM_BOT_TOKEN` = your bot token
     - `TELEGRAM_VALIDATE_URL` = **your backend URL** (e.g. `https://your-api-xxxx.run.app`)
  5. **Minimum instances = 1** so the bot never scales to zero.
- The bot only calls your backend (validate, latest-pdf, latest-report). When you deploy a new backend, the bot keeps using the latest API; redeploy the bot only when you change bot code.

**Summary**

| | Option A (one service) | Option B (two services) |
|--|------------------------|--------------------------|
| Backend | `python nauticai_api.py`, min 1 | uvicorn, can scale to 0 |
| Bot | Subprocess of backend | Separate small service, min 1 |
| Cost | One heavy instance 24/7 | Bot: one small instance 24/7; API: pay per request |
| Deploy latest backend | Redeploy one service | Redeploy backend only; bot unchanged |

---

## Option B: Where everything runs (2 on Google Cloud, 1 on Vercel)

You deploy **3 things** in total:

| # | What | Where | Role |
|---|------|--------|------|
| 1 | **Backend API** (FastAPI) | **Google Cloud Run** | Auth, inspect, reports, `/api/telegram/validate`, `/api/telegram/latest-pdf`, etc. Can scale to zero. |
| 2 | **Telegram bot** (Python script) | **Google Cloud Run** (separate service) | Runs 24/7 (min instances = 1). Polls Telegram; calls your Backend API URL for validate / latest-pdf / latest-report. |
| 3 | **Frontend** (Next.js) | **Vercel** | Dashboard, login, inspect UI. Uses `NEXT_PUBLIC_API_URL` = your Backend API URL. |

So: **2 services on Google Cloud** (backend + bot), **1 app on Vercel** (frontend). No second “backend” on Vercel – Vercel only serves the frontend; the frontend talks to your Cloud Run backend.

**Option B checklist**

1. **Google Cloud – Backend API**
   - Build from backend folder; Dockerfile runs `uvicorn nauticai_api:app --host 0.0.0.0 --port $PORT`.
   - Env: `POSTGRES_DSN`, `JWT_SECRET`, etc. (no need for `NAUTICAI_START_TELEGRAM_BOT` or `TELEGRAM_BOT_TOKEN` on this service).
   - Note the backend URL (e.g. `https://nauticai-api-xxxx.run.app`).

2. **Google Cloud – Telegram bot**
   - Build with **Dockerfile.bot** from the same backend folder.
   - Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_VALIDATE_URL` = **backend URL** from step 1.
   - Set **Minimum instances = 1**.

3. **Vercel – Frontend**
   - Deploy the Next.js app. Set **NEXT_PUBLIC_API_URL** = same backend URL (step 1).
   - In production the frontend uses the same-origin proxy (`/api/backend`); the proxy forwards JSON and binary (e.g. PDF) responses correctly.

**Production checklist:** See **PRODUCTION_CHECKLIST.md** for env vars, DB migration, security, speed tips, and post-deploy checks.

**Deployed URLs (this project)**  
- **Telegram bot (Cloud Run):** https://nauticaibot-816993186449.europe-west1.run.app (health: returns `ok`)
