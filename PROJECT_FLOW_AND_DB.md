# NautiCAI – Project flow & database status

## 1. Is the database connected?

**Configured vs connected**

- **Configured:** `POSTGRES_DSN` (or `DATABASE_URL`) is set in `NautiCAI/.env`. Your `.env` has it, so the app is **configured** to use Neon Postgres.
- **Connected:** The app can actually reach Neon and run a query. That depends on network (firewall, VPN, Neon project not paused).

**How to check**

1. Start the backend: `uvicorn api:app --reload --port 8000`
2. Open: **http://localhost:8000/health**
3. Read the JSON:
   - `"postgres": "ok"` → DB is **connected**
   - `"postgres": "error"` and `"postgres_error": "..."` → DB is **not connected** (e.g. timeout, wrong credentials). Fix network/Neon or connection string.
   - `"postgres": "not_configured"` → No `POSTGRES_DSN` in `.env`

**What works when DB is not connected**

- **Inspect + Results:** Work. Run inspection → POST /detect runs (with `NAUTICAI_SKIP_AUTH=1`), response is stored in the browser and you’re redirected to Results. No DB needed.
- **Dashboard & Reports:** Load but show **empty** data. They call GET /inspections, which queries Postgres; on failure the API returns `{ inspections: [] }`, so you see zero inspections and empty lists.
- **Login/Signup:** Require DB (sessions and users are in Postgres). If DB is down, login will fail unless you use skip-auth for /detect only.

So: **database is configured**. Whether it’s **connected** you see from **http://localhost:8000/health**. If it’s not connected, Inspect and live Results still work; Dashboard and Reports stay empty until DB is reachable.

---

## 2. Flow: starting the app → Dashboard → Reports

### Starting the application

1. **Backend** (from `NautiCAI/`):
   ```bash
   uvicorn api:app --reload --port 8000
   ```
2. **Frontend** (from `NautiCAI/frontend/`):
   ```bash
   npm run dev
   ```
3. Open **http://localhost:3000** in the browser.

### Page-by-page flow

| Step | Where | What happens |
|------|--------|----------------|
| 1 | **Home** (`/`) | Landing. “Start Inspection” → if no token → **Login**; if token → **Inspect**. |
| 2 | **Login** (`/login`) | Sign in (or sign up). On success, token is stored in `localStorage`, redirect to **Dashboard**. |
| 3 | **Dashboard** (`/dashboard`) | Requires token (else redirect to Login). Calls API: `getStats()` + `listInspections()` → **GET /inspections**. Shows summary stats and list of inspections. Each row can open **Results**. “Inspect” → Inspect page; “Reports” → Reports page. **If DB is down:** API returns empty list → Dashboard shows 0 inspections and empty list. |
| 4 | **Inspect** (`/inspect`) | Requires token. Upload file, optional vessel name, click “Run inspection” → **POST /detect** (with auth unless `NAUTICAI_SKIP_AUTH=1`). On success, response is stored in `sessionStorage`, redirect to **Results** with `?source=live`. |
| 5 | **Results** (`/results/[id]`) | If `?source=live`, data is read from `sessionStorage` (no DB). Otherwise, Dashboard/Reports link here and the page can load inspection by id from **GET /inspections** (needs DB). Shows annotated image, detections, species, NDT inputs, PDF button. |
| 6 | **Reports** (`/reports`) | Requires token. Calls **GET /inspections**, shows full list, filter/sort, links to **Results** by inspection id. **If DB is down:** same as Dashboard → empty list. |

### Quick flow diagram

```
Home (/) → Start Inspection
    → no token → Login → Dashboard
    → has token → Inspect

Login → (success) → Dashboard

Dashboard → Inspect (new inspection)
          → Reports (all inspections)
          → Results/[id] (from list, needs DB)

Inspect → Run → POST /detect → Results/[id]?source=live (sessionStorage, no DB)

Reports → Results/[id] (from list, needs DB)
```

### Summary

- **Inspect and live Results** work without the database (one-off run, data from session).
- **Dashboard and Reports** need the database to show inspection history; if DB is not connected, they load but stay empty.
- To confirm DB status, use **http://localhost:8000/health** and check `postgres` and `postgres_error`.

---

## 3. Auth: sign up, sign in, forgot password (Brevo)

**Sign up / Sign in**

- Login page: `/login` (mode toggle Sign in / Sign up).
- **Password strength** is shown when typing (Weak / Fair / Strong) with a bar; use a strong password when signing up.
- Token is stored in `localStorage`; protected pages (Dashboard, Inspect, Reports) redirect to Login if no token.

**Forgot password**

- User clicks **Forgot password?** on the login page, enters email, submits.
- Backend: `POST /auth/forgot-password` looks up the user in Postgres; if found and **Brevo is configured**, sends an email with a reset link via Brevo.
- Reset link format: `{FRONTEND_URL}/reset-password?token=...` (token is a JWT, valid 1 hour).
- User clicks the link → **Reset password** page (`/reset-password?token=...`) → enters new password and confirms → `POST /auth/reset-password` → password updated, redirect to Login.

**Brevo setup (in `NautiCAI/.env`)**

- **BREVO_API_KEY:** Paste your API key from [Brevo](https://app.brevo.com) → SMTP & API → API Keys. If empty, forgot-password still returns success (no email sent).
- **FRONTEND_URL:** Base URL of the frontend used in the reset link. Local: `http://localhost:3000`. Production: your app URL (e.g. `https://nauticai-frontend.vercel.app`).

**CORS**

- Backend allows `http://localhost:3000`, `http://127.0.0.1:3000`, and the production origin. Auth endpoints use the same CORS policy; no extra config needed.
