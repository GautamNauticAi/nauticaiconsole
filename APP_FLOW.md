# How the NautiCAI Application Works (Agentic Backend)

## Overview

The app is a **hull inspection** flow: user uploads a hull image → backend runs AI (YOLO + SAM) → returns IMO rating, coverage %, and generates an official PDF. The UI shows results and lets the user download the PDF.

---

## 1. User opens the app

- **URL:** e.g. `http://localhost:3000`
- With `NEXT_PUBLIC_USE_AGENTIC=1`, **no login** is required: user can go straight to Dashboard, Inspect, or Reports.
- **Nav:** Dashboard | Inspect | Reports | Learn (and Login if not using Agentic).

---

## 2. Run an inspection (Inspect page)

1. User goes to **Inspect**.
2. **Optionally** enters a **vessel name** (e.g. "Vessel_Alpha_001"). If left blank, the app uses `inspection_<timestamp>` as the vessel id.
3. User **selects or drops** one or more **images** (JPG, PNG, WebP, or MP4).
4. Clicks **Run inspection**.
5. **Frontend** sends for each image:
   - **POST** `http://localhost:8000/api/inspect`
   - **Body:** `FormData` with `vessel_id` and `image` (file).
6. **Backend (Agentic):**
   - Saves the image temporarily.
   - Runs **YOLO** (biofouling detection) then **SAM** (segmentation).
   - Computes **hull coverage %** and **severity**.
   - Applies **IMO logic** → rating (FR-0 to FR-4), recommended action, requires_cleaning.
   - Saves JSON report and generates **PDF** in the `reports/` folder.
   - Returns **JSON** (metadata, ai_vision_metrics, compliance_result).
7. **Frontend** stores the last response in **sessionStorage** and **redirects** to:
   - **Results** page: `/results/<vessel_id>?source=live` (and `&batch=1` if multiple images).

---

## 3. View results (Results page)

1. User lands on **Results** for that **vessel_id**.
2. **Data source:**
   - If just ran inspection (`?source=live`): data comes from **sessionStorage** (no extra API call).
   - If opened later (e.g. from Dashboard): frontend calls **GET** `/api/vessel/<vessel_id>/latest-report` to load the report.
3. **UI shows:**
   - **Header:** Vessel ID, inspection timestamp.
   - **Summary cards:** Hull coverage %, IMO rating, Condition (severity + number of fouling areas).
   - **Risk:** “Cleaning required” or “Acceptable” (from `requires_cleaning`).
   - **What we found:** IMO rating, recommended action, fouling areas count and coverage/severity.
4. **Download PDF:** user clicks **Download PDF** → frontend opens **GET** `/api/vessel/<vessel_id>/pdf` in a **new tab** → browser shows or downloads the **server-generated** IMO-style report.

---

## 4. Dashboard

1. User goes to **Dashboard**.
2. **Frontend** calls **GET** `http://localhost:8000/api/vessels/all`.
3. **Backend** returns a list of **vessels** (one per inspection so far), each with: `vessel_id`, `last_inspection`, `imo_rating`, `requires_cleaning`.
4. **UI shows:**
   - **Stats:** total inspections, high-risk count, total anomalies (derived), average risk score.
   - **Table:** recent vessels (vessel name/id, file, anomalies, risk, status, date).
5. **Actions:**
   - **Results** → link to `/results/<vessel_id>` (same Results page as above).
   - **PDF** → opens `/api/vessel/<vessel_id>/pdf` in a new tab.
   - **Remove** → calls delete; backend does **not** support delete, so user sees “Delete not supported by backend.”

---

## 5. Reports

1. User goes to **Reports**.
2. Same as Dashboard: **GET** `/api/vessels/all` → list of vessels.
3. **UI:** filter by status, search, sort by date or risk; table of vessels with **Results** link and **PDF** button (and Remove, which is not supported by backend).

---

## 6. Data flow (summary)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js, port 3000)                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Inspect page                                                            │
│    → User picks image + vessel name                                      │
│    → POST /api/inspect (vessel_id + image)                               │
│    → Store response in sessionStorage                                    │
│    → Redirect to /results/<vessel_id>                                    │
│                                                                          │
│  Results page                                                            │
│    → If from Inspect: read sessionStorage                                │
│    → Else: GET /api/vessel/<id>/latest-report                            │
│    → Show IMO, coverage, severity, action                                │
│    → Download PDF → GET /api/vessel/<id>/pdf (new tab)                   │
│                                                                          │
│  Dashboard / Reports                                                     │
│    → GET /api/vessels/all                                                │
│    → Show list → Results link + PDF button                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │  HTTP (localhost:8000)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AGENTIC BACKEND (FastAPI, port 8000)                  │
├─────────────────────────────────────────────────────────────────────────┤
│  POST /api/inspect     → YOLO + SAM → IMO logic → save JSON + PDF        │
│  GET  /api/vessels/all → List vessels from reports/                      │
│  GET  /api/vessel/<id>/latest-report → Return saved JSON                 │
│  GET  /api/vessel/<id>/pdf          → Return saved PDF file              │
│  GET  /health, /docs   → Health check, Swagger UI                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. What runs where

| Component        | Where it runs        | Role |
|-----------------|----------------------|------|
| **Frontend**    | Browser (Next.js dev or build) | UI: Inspect, Results, Dashboard, Reports. Calls backend API. |
| **Agentic API** | `python nauticai_api.py` in `AgenticAI_Backend/.../NautiCAI_Backend` | Receives uploads, runs vision pipeline, IMO, saves JSON + PDF, serves PDF and list. |
| **Models**      | Same machine as Agentic API   | `biofouling_best.pt` (YOLO), `sam_vit_b_01ec64.pth` (SAM) loaded at startup. |
| **Telegram bot**| Optional, separate process    | `python nauticai_telegram_bot.py` — not called by the web app. |

That’s the full flow of how your application works with the Agentic backend.
