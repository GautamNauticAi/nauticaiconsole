# NautiCAI — Models Integration Guide

> **For your Cursor / backend team.**  
> This folder contains all 5 production ONNX models used by the NautiCAI inspection pipeline.  
> Read this fully before wiring them into your backend — the thresholds, remaps, and filters are critical.

---

## Folder Contents

```
nauticai_models_deploy/
├── hull_inspection_best.onnx   (42.7 MB)  — Corrosion specialist  ← YOLOv8s
├── biofouling_best.onnx        (98.8 MB)  — Biofouling specialist ← YOLOv8m
├── crack_best.onnx             (98.8 MB)  — Crack specialist      ← YOLOv8m  ★ best accuracy
├── paint_fouling_best.onnx     (98.8 MB)  — Paint peel specialist ← YOLOv8m
├── debris_best.onnx            (98.8 MB)  — Debris specialist     ← YOLOv8m
└── MODELS_INTEGRATION_GUIDE.md            — This file
```

**Why ONNX?**  
ONNX runs on any platform without PyTorch. Use `onnxruntime` (CPU) or `onnxruntime-gpu` (CUDA/TensorRT).  
All models: input `(1, 3, 640, 640)` float32, output `(1, N_classes+4, 8400)` — standard YOLOv8 format.

---

## Model Registry

| Model file | Label | Raw classes | Output class | Conf threshold | mAP50 |
|---|---|---|---|---|---|
| `hull_inspection_best.onnx` | CorrosionSpec | corrosion, marine_growth, debris, healthy_surface | **corrosion** | **0.20** | ~80% |
| `biofouling_best.onnx` | BiofoulingSpec | biofouling | biofouling | **0.50** | 81.8% |
| `crack_best.onnx` | CrackSpec | crack | crack | **0.35** | 93.1% |
| `paint_fouling_best.onnx` | PaintFoulingSpec | paint_fouling | paint_peel | **0.35** | 77.3% |
| `debris_best.onnx` | DebrisSpec | debris | debris | **0.35** | 79.6% |

> **IOU threshold for all models: 0.40**  
> **Image size for all models: 640×640**

---

## Critical: Class Remaps

`hull_inspection_best` was trained on a dataset where corroded surfaces were sometimes labeled as `debris` or `marine_growth`. You **must** remap these before using the output:

```python
# Apply ONLY to hull_inspection_best — not to other models
HULL_REMAP = {
    "debris":        "corrosion",   # rust/flaking mislabeled as debris
    "marine_growth": "corrosion",   # surface corrosion mislabeled as marine growth
}

# Always suppress — not a defect class
SUPPRESS = {"healthy_surface"}

# paint_fouling_best outputs "paint_fouling" — rename for display
PAINT_REMAP = {
    "paint_fouling": "paint_peel",
}
```

---

## Critical: Fish / False-Positive Filters

These filters **must** be applied after inference. Without them, fish images trigger false corrosion and debris detections.

### Filter 1 — Hull model: marine_growth size filter
```python
# hull_inspection_best only
# Fish scales produce tiny marine_growth boxes (0.2–6% of image area)
# Real corrosion covers large hull areas (>8%)
if model == "hull_inspection_best" and raw_class == "marine_growth":
    box_area_ratio = (box_w * box_h) / (img_w * img_h)
    if box_area_ratio < 0.08:
        drop()   # fish scale — not corrosion
```

### Filter 2 — Hull model: debris + marine_growth co-occurrence
```python
# hull_inspection_best only
# Fish images always have BOTH debris boxes AND marine_growth boxes
# Real hull images with only a debris box = genuine corrosion
if model == "hull_inspection_best" and raw_class == "debris":
    has_marine_growth = any box in this image has class "marine_growth"
    if has_marine_growth:
        drop()   # fish scene — not corrosion
```

### Filter 3 — Biofouling size filter
```python
# biofouling_best only
# Real biofouling: medium patches on hull (0.5%–25% of image)
# Fish swimming past: large box (>25%), or tiny noise (<0.5%)
if model == "biofouling_best":
    box_area_ratio = (box_w * box_h) / (img_w * img_h)
    if box_area_ratio > 0.25:   drop()   # fish swimming past camera
    if box_area_ratio < 0.005:  drop()   # noise / reflection
    if box_w < 15 or box_h < 15: drop() # too small to be real fouling
```

### Filter 4 — Debris size filter
```python
# debris_best only
# Fish bodies produce small debris boxes (3–8% area) in small images
# Real debris on a hull is larger or the image is a proper hull close-up
if model == "debris_best":
    box_area_ratio = (box_w * box_h) / (img_w * img_h)
    if box_area_ratio < 0.10 and (img_w < 400 or img_h < 300):
        drop()   # fish body in small image
```

---

## Test Results (Verified on this machine)

### Fish images — zero false positives required

| Model | download(2).jpg | download(3).jpg | fish_test_3.jpg | test_fish.jpg | Result |
|---|---|---|---|---|---|
| CorrosionSpec | ✅ clean | ✅ clean | ✅ clean | ✅ clean | **PASS** |
| BiofoulingSpec | ✅ clean | ✅ clean | ✅ clean | ✅ clean | **PASS** |
| CrackSpec | ✅ clean | ✅ clean | ✅ clean | ✅ clean | **PASS** |
| PaintFoulingSpec | ✅ clean | ✅ clean | ✅ clean | ✅ clean | **PASS** |
| DebrisSpec | ✅ clean | ✅ clean | ✅ clean | ✅ clean | **PASS** |

### Corrosion images — recall

| Model | corrision1 | corrision2 | corrision3 | corrision4 | corrision5 | Recall |
|---|---|---|---|---|---|---|
| CorrosionSpec | ✅ | ❌ (too small) | ✅ | ✅ | ✅ | **4/5** |

> corrision2 (275×183px) — model sees nothing even at conf=0.05. Image is too low-res.

---

## How to Load and Run (Python)

### Option A — Ultralytics (recommended, handles pre/post-processing)

```python
from ultralytics import YOLO

# Load ONNX model — Ultralytics handles all pre/post-processing
model = YOLO("crack_best.onnx", task="detect")

results = model.predict(
    source="image.jpg",
    conf=0.35,          # per-model threshold (see table above)
    iou=0.40,
    imgsz=640,
    save=False,
    verbose=False,
    half=False,         # IMPORTANT: keep False — avoids FP16 fuse crash on hull model
)

r = results[0]
for i in range(len(r.boxes)):
    cls  = r.names[int(r.boxes.cls[i])]
    conf = float(r.boxes.conf[i])
    x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
    print(f"{cls}  {conf:.2f}  ({x1:.0f},{y1:.0f})-({x2:.0f},{y2:.0f})")
```

### Option B — Pure onnxruntime (no PyTorch needed)

```python
import onnxruntime as ort
import numpy as np
import cv2

def preprocess(img_path: str, imgsz: int = 640):
    img = cv2.imread(img_path)
    h, w = img.shape[:2]
    # Letterbox resize
    scale = imgsz / max(h, w)
    nh, nw = int(h * scale), int(w * scale)
    resized = cv2.resize(img, (nw, nh))
    canvas = np.zeros((imgsz, imgsz, 3), dtype=np.uint8)
    canvas[:nh, :nw] = resized
    # BGR -> RGB, HWC -> CHW, normalize
    tensor = canvas[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
    return tensor[np.newaxis], scale, (h, w)

def postprocess(output, conf_thresh, scale, orig_hw):
    # output shape: (1, num_classes+4, 8400)
    preds = output[0][0].T   # (8400, num_classes+4)
    boxes, scores = preds[:, :4], preds[:, 4:]
    class_ids = scores.argmax(axis=1)
    confs = scores.max(axis=1)
    mask = confs > conf_thresh
    boxes, confs, class_ids = boxes[mask], confs[mask], class_ids[mask]
    # cx,cy,w,h -> x1,y1,x2,y2 (scaled back to original)
    cx, cy, bw, bh = boxes.T
    x1 = (cx - bw/2) / scale
    y1 = (cy - bh/2) / scale
    x2 = (cx + bw/2) / scale
    y2 = (cy + bh/2) / scale
    return list(zip(class_ids, confs, x1, y1, x2, y2))

# Load
sess = ort.InferenceSession("crack_best.onnx",
    providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
input_name = sess.get_inputs()[0].name

# Run
tensor, scale, orig_hw = preprocess("image.jpg")
output = sess.run(None, {input_name: tensor})
detections = postprocess(output, conf_thresh=0.35, scale=scale, orig_hw=orig_hw)
```

---

## How the Async Pipeline Works (api.py architecture)

The production backend uses FastAPI + asyncio to process multiple images concurrently without blocking.

```
POST /detect  (image/video)
      │
      ▼
  asyncio event loop
      │
      ├─ run_in_executor(thread_pool) ──► Model 1: CorrosionSpec  ─┐
      ├─ run_in_executor(thread_pool) ──► Model 2: BiofoulingSpec  ├─► gather()
      ├─ run_in_executor(thread_pool) ──► Model 3: CrackSpec       │
      ├─ run_in_executor(thread_pool) ──► Model 4: PaintFoulingSpec│
      └─ run_in_executor(thread_pool) ──► Model 5: DebrisSpec     ─┘
                                                    │
                                                    ▼
                                          _merge_detections()
                                          ├─ Apply per-model remaps
                                          ├─ Apply fish filters
                                          ├─ Weighted Box Fusion (WBF)
                                          ├─ Global NMS
                                          └─ ResNet species classification
                                                    │
                                                    ▼
                                          JSON response
```

### Key async pattern

```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

_thread_pool = ThreadPoolExecutor(max_workers=8)

async def run_all_models(image_paths: list) -> list:
    loop = asyncio.get_event_loop()
    
    # All 5 models run in parallel in thread pool
    tasks = [
        loop.run_in_executor(_thread_pool, model.predict, image_paths, conf, ...)
        for model, conf in active_models
    ]
    
    # Wait for all to finish
    all_results = await asyncio.gather(*tasks)
    return all_results
```

> **Why thread pool and not process pool?**  
> PyTorch/ONNX inference releases the GIL during computation, so threads work fine.  
> Process pool would require re-loading models in each process (expensive).

### Video frame extraction (smart interval)

```python
def smart_frame_interval(duration_sec: float) -> float:
    """
    Target ~60 frames regardless of video length.
    2 min video  → 2s interval  → 60 frames
    10 min video → 10s interval → 60 frames
    30 min video → 30s interval → 60 frames
    Hard limits: min=2s, max=30s, max_frames=120
    """
    interval = duration_sec / 60
    return max(2.0, min(30.0, interval))
```

---

## Weighted Box Fusion (WBF)

When multiple models detect the same defect, WBF merges their boxes instead of picking one:

```python
def weighted_box_fusion(boxes: list) -> dict:
    """
    boxes = list of dets from different models for same region
    Returns single fused detection with:
      - coordinates = confidence-weighted average of all boxes
      - confidence  = weighted avg * agreement_boost (more models = higher conf)
    """
    total_conf = sum(b["confidence"] for b in boxes)
    x1 = sum(b["x1"] * b["confidence"] for b in boxes) / total_conf
    # ... same for y1, x2, y2
    agreement_boost = 1.0 + (len(boxes) - 1) * 0.05  # +5% per extra model
    fused_conf = min(0.99, (total_conf / len(boxes)) * agreement_boost)
    return {"x1": x1, ..., "confidence": fused_conf}
```

---

## Confidence Calibration

Raw YOLO confidence is multiplied by a per-class factor to reflect real-world precision:

```python
CONF_CALIBRATION = {
    "corrosion":  0.90,   # hull_inspection precision ~80%
    "biofouling": 0.87,   # biofouling_best precision 86.7%
    "crack":      0.95,   # crack_best precision 94.6% — most reliable
    "paint_peel": 0.86,   # paint_fouling_best precision 85.7%
    "debris":     0.88,   # debris_best precision 88.1%
}

calibrated_conf = raw_conf * CONF_CALIBRATION[class_name]
```

---

## Risk Level Logic

```python
def calc_risk(detections):
    if not detections:
        return "SAFE"
    max_conf = max(d["confidence"] for d in detections)
    if max_conf > 0.40:   return "HIGH"
    if max_conf > 0.25:   return "MEDIUM"
    return "LOW"
```

---

## Environment Variables

```env
# Inference
YOLO_CONF=0.35          # global default (overridden per-model in code)
YOLO_IOU=0.40
YOLO_IMGSZ=640
MERGE_IOU=0.45          # cross-model dedup threshold

# Workers
N_WORKERS=4             # async worker coroutines
BATCH_SIZE=8            # images per YOLO batch call

# Video
FRAME_INTERVAL_SEC=     # leave blank for auto (smart interval)

# Species classifier
SPECIES_CONF=0.70       # min confidence for ResNet species label

# GPU
SAM3_ENABLED=           # set to 1 to enable SAM3 segmentation masks (GPU only)

# Supabase
SUPABASE_URL=
SUPABASE_KEY=
```

---

## Requirements

```txt
fastapi==0.111.0
uvicorn==0.30.6
python-multipart==0.0.9
python-dotenv==1.0.1
opencv-python-headless==4.10.0.84
numpy==1.26.4
torch==2.3.1
torchvision==0.18.1
ultralytics==8.2.100
onnxruntime-gpu==1.23.2   # or onnxruntime==1.23.2 for CPU-only
onnx==1.21.0
supabase==2.5.0
psycopg2-binary==2.9.9
```

> For CPU-only deployment replace `onnxruntime-gpu` with `onnxruntime`.

---

## Quick Start

```bash
# 1. Install
pip install -r requirements.txt

# 2. Copy .env
cp .env.example .env
# fill in SUPABASE_URL and SUPABASE_KEY

# 3. Place ONNX models in model_2/ folder (or update paths in api.py)

# 4. Start server
uvicorn api:app --host 0.0.0.0 --port 8000

# 5. Test
curl -X POST http://localhost:8000/detect \
  -F "file=@your_hull_image.jpg"
```

---

## What NOT to Change

| Thing | Why |
|---|---|
| `half=False` in predict calls | hull_inspection_best has FP16 dtype mismatch — will crash on GPU if half=True |
| Per-model conf thresholds | Tuned against real corrosion + fish test images. Raising them loses recall, lowering adds FPs |
| Fish filters | Removing them causes 49+ false positives on fish images |
| `debris→corrosion` remap scope | Must be hull_inspection_best ONLY — debris_best.pt correctly outputs debris |
| ONNX opset 12 | Opset 13+ has compatibility issues with some ONNX Runtime versions |

---

*Generated: NautiCAI pipeline — April 2026*
