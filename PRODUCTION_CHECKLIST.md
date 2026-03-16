# NautiCAI – Production checklist

Use this before going live (Backend + Bot on Google Cloud, Frontend on Vercel).

---

## 1. Environment variables

### Backend API (Cloud Run)

| Variable | Required | Notes |
|----------|----------|--------|
| `POSTGRES_DSN` | Yes (for auth + inspections) | Neon or other Postgres connection string |
| `JWT_SECRET` | Yes | Strong secret for tokens; never commit |
| `PORT` | Set by Cloud Run | Backend reads this for binding |
| `FRONTEND_URL` | Optional | For CORS / password reset links (e.g. `https://your-app.vercel.app`) |
| `NAUTICAI_MAX_INFERENCE_SIZE` | Optional | Cap image size for inference (e.g. `1280`) to speed up detection |

Do **not** set `NAUTICAI_START_TELEGRAM_BOT` or `TELEGRAM_BOT_TOKEN` on the API service if you use Option B (separate bot).

### Telegram bot (Cloud Run, Option B)

| Variable | Required | Notes |
|----------|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Yes | From BotFather |
| `TELEGRAM_VALIDATE_URL` | Yes | Your **Backend API** base URL (e.g. `https://nauticai-api-xxxx.run.app`) |

### Frontend (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_API_URL` | Yes | Same as Backend API URL (e.g. `https://nauticai-api-xxxx.run.app`) |

In production the app uses the same-origin proxy (`/api/backend`) so the browser talks to your domain; the proxy forwards to `NEXT_PUBLIC_API_URL`. PDF downloads and JSON APIs are supported.

---

## 2. Backend model files (Cloud Run API)

- **SAM** is downloaded during Docker build (no action needed).
- **YOLO** (`biofouling_best.pt`) is not in the repo (`.gitignore` has `*.pt`). To have inspections work in production, either:
  - **Option A:** Add it to the repo once:  
    `git add -f "AgenticAI_Backend/NautiCAI AI/NautiCAI_Backend/biofouling_best.pt"` then commit and push (so Cloud Build includes it), or  
  - **Option B:** Add a Cloud Build step that copies the file from a GCS bucket into the backend folder before the Docker build step.

Without `biofouling_best.pt` in the image, the API will start but running an inspection will fail when loading the model.

---

## 3. Database

- Run **Neon** (or Postgres) and apply **`migrations/run_once_neon.sql`** once (users table with `username`, `telegram_user_id`; `agentic_inspections`; indexes).
- Ensure `POSTGRES_DSN` uses the connection string from your Neon project (or pooler URL if you use one).

---

## 4. Security

- No secrets in code or in repo (use env only).
- `JWT_SECRET` and `POSTGRES_DSN` are sensitive; set only in Cloud Run / Vercel env.
- CORS: backend allows origins from `FRONTEND_URL` or defaults; production frontend uses proxy so same-origin requests avoid CORS issues.

---

## 5. Speed / performance

- **Backend:** `GET /api/vessels/all` is cached in-memory per user (45s TTL). Cache is invalidated when a new inspection is saved. This reduces repeated DB + file reads.
- **Frontend:** Inspections list is cached 60s and in-flight requests are deduplicated so dashboard and reports don’t double-fetch.
- **Inference:** Set `NAUTICAI_MAX_INFERENCE_SIZE` (e.g. `1280`) to cap image size and speed up detection; see backend startup logs for CPU warning if not using GPU.

---

## 6. Health and logs

- Backend: `GET /health` returns 200 when the app is up; use it for Cloud Run health checks.
- Avoid heavy `print()` in production; consider replacing with a small logger if needed.

---

## 7. Deployment order

1. **Neon:** Create DB, run `run_once_neon.sql`.
2. **Backend API:** Deploy to Cloud Run with env; note the service URL.
3. **Telegram bot:** Deploy with `Dockerfile.bot`; set `TELEGRAM_VALIDATE_URL` = backend URL; min instances = 1.
4. **Frontend:** Deploy to Vercel; set `NEXT_PUBLIC_API_URL` = backend URL.
5. (Optional) Attach a custom domain in Vercel and/or Cloud Run.

---

## 8. Post-deploy checks

- [ ] Login and signup work (backend + Neon).
- [ ] Run an inspection from the dashboard; report and PDF appear.
- [ ] Dashboard and Reports pages load vessel list without long delay.
- [ ] PDF download works from the app (proxy forwards binary correctly).
- [ ] Telegram: `/start` → enter username → Get Latest Report / Download PDF work.
- [ ] No `localhost` or dev URLs in production env.
