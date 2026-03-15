# Integrating Prasad's updated model (or any new YOLOv8 hull model)

The frontend does **not** run the model itself. It calls the **FastAPI backend** (`api.py`), which loads a YOLOv8 weights file and runs inference. To use Prasad's updated trained model:

---

## Option A: Replace the default weights file (simplest)

1. **Extract** Prasad's project from the zip.
2. **Locate** the trained weights file in his project:
   - Usually: `runs/detect/train/weights/best.pt` (Ultralytics training output), or  
   - A file named `best.pt` / `best (2).pt` in the project root.
3. **Replace** the existing weights in this backend folder:
   - **Replace:** `NautiCAI/best.pt` (the current model file, same folder as `api.py`)
   - **With:** Prasad's new `best.pt` (copy it in and name it `best.pt`).
   - Optional: back up the old one first (e.g. rename to `best_old.pt`).

After that, restart the API. It will load the new model automatically. No frontend or code changes needed.

---

## Option B: Use a different path without replacing `best.pt`

You can point the backend to Prasad's weights **without** overwriting your current `best.pt`:

1. Put Prasad's weights file somewhere (e.g. `NautiCAI/models/prasad_best.pt`).
2. In `NautiCAI/.env`, set:
   ```env
   NAUTICAI_MODEL_PATH=models/prasad_best.pt
   ```
   Or use an absolute path:
   ```env
   NAUTICAI_MODEL_PATH=C:\path\to\prasad_project\best.pt
   ```
3. Restart the API: `uvicorn api:app --reload --port 8000`.

---

## Optional: Update model metrics (precision, recall, mAP)

If the new training produced different metrics, you can pass them via env so the API (and frontend) show the correct numbers:

In `.env`:

```env
NAUTICAI_MODEL_METRICS=0.92,0.89,0.91,0.85
```

Order: **precision, recall, map50, map5095** (comma-separated).  
If you don’t set this, the default metrics in code are used.

---

## Class names and colors

- Class names come **from the model** (e.g. corrosion, marine growth, debris, healthy). The API uses whatever `result.names` returns.
- Bounding-box colors are mapped in `api.py` in `CLASS_COLORS_BGR`. If Prasad's model uses the same class names, colors will match. New class names will use the default teal color; you can add entries to `CLASS_COLORS_BGR` if you want custom colors.

---

## Quick checklist

- [ ] Extracted zip and found `best.pt` (or equivalent) in Prasad's project  
- [ ] Replaced `NautiCAI/best.pt` **or** set `NAUTICAI_MODEL_PATH` in `.env`  
- [ ] (Optional) Set `NAUTICAI_MODEL_METRICS` in `.env`  
- [ ] Restarted the API  
- [ ] Run an inspection from the frontend to verify detections and metrics  

No frontend code changes are required; the existing Inspect flow already uses the backend that loads this model.

---

## If Postgres/Neon is unreachable (401 on /detect)

When the database times out, the API cannot validate your auth token and returns **401 Unauthorized**, so the model never runs. To **test the model locally** without the DB, in `NautiCAI/.env` add:

```env
NAUTICAI_SKIP_AUTH=1
```

Restart the API. Then run an inspection from the frontend; `/detect` will work without validating the token. Remove this or set it to `0` for production.

---

## Two-stage pipeline: biofouling + species (`species.pt`)

When you run an inspection, the backend runs two models in one go:

1. **best.pt** (object detection) — finds biofouling (and other hull anomalies).
2. **species.pt** (classification) — for each biofouling bounding box, crops that region and runs the species model to identify organisms (e.g. Barnacles, Tubeworms, Algae). Results are attached to each biofouling detection and shown in the results UI.

**Setup:** Place `species.pt` in the same folder as `api.py` (`NautiCAI/`). If the file is missing, the API still runs; it just skips species classification. To use a different path:

```env
NAUTICAI_SPECIES_MODEL_PATH=path/to/species.pt
```

Species are shown under each biofouling detection in "Detected Anomalies" and on the annotated image label. No extra click — one "Run inspection" runs both models and compiles everything.

**ResNet species.pt showing "class_0", "class_1"?**  
Those are the model’s class indices. To show real names (e.g. ALGAE, BARNACLES), set in `NautiCAI/.env`:

```env
NAUTICAI_SPECIES_CLASSES=ALGAE,BARNACLES,TUBEWORMS,OTHER
```

Use the **exact order** your species model was trained with (index 0 = first name, 1 = second, …). Restart the API after changing.
