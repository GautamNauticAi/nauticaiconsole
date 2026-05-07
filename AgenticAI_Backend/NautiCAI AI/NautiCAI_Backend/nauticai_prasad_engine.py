"""
Prasad-style multi-YOLO hull + ResNet species inference, implemented inside NautiCAI.

Supports:
  • **v2 (recommended):** five ONNX specialists from `nauticai_models_deploy` — per-model conf,
    IOU 0.40, imgsz 640, half=False, hull/paint remaps, and fish false-positive filters (Apr 2026 guide).
  • **legacy:** `.pt` / `.engine` — hull_inspection_best + best (3) + biofouling_best (prior layout).

Weights directory:
  NAUTICAI_PRASAD_MODEL_DIR or NAUTICAI_PRASAD_REPO — folder with models (optional model_2/, deploy paths).
  Default: <this backend>/prasad_models

Env (legacy + optional overrides):
  YOLO_CONF, YOLO_IOU, MERGE_IOU, YOLO_IMGSZ — legacy defaults; v2 ONNX stack uses guide values unless set.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, List, Optional, Tuple

import cv2
import numpy as np

# JetPack TensorRT Python bindings call np.bool; NumPy 1.24+ removed it (use np.bool_ / bool).
if not hasattr(np, "bool"):
    np.bool = np.bool_  # type: ignore[attr-defined,misc]

import torch

# Torch checkpoints (Ultralytics / full ckpt) need weights_only=False on newer PyTorch.
_orig_torch_load = torch.load


def _safe_torch_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _orig_torch_load(*args, **kwargs)


torch.load = _safe_torch_load

from ultralytics import YOLO

# --- Legacy inference tuning ---
YOLO_CONF = float(os.getenv("YOLO_CONF", "0.25"))
YOLO_IOU = float(os.getenv("YOLO_IOU", "0.30"))
MERGE_IOU = float(os.getenv("MERGE_IOU", "0.40"))
YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "416"))

# --- v2 ONNX stack (MODELS_INTEGRATION_GUIDE.md); separate from legacy YOLO_* ---
V2_IOU = float(os.getenv("NAUTICAI_PRASAD_ONNX_IOU", "0.40"))
V2_IMGSZ = int(os.getenv("NAUTICAI_PRASAD_ONNX_IMGSZ", "640"))

V2_MODELS: Tuple[Tuple[str, float], ...] = (
    ("hull_inspection_best", 0.20),
    ("biofouling_best", 0.50),
    ("crack_best", 0.35),
    ("paint_fouling_best", 0.35),
    ("debris_best", 0.35),
)

HULL_REMAP = {
    "debris": "corrosion",
    "marine_growth": "corrosion",
}
PAINT_REMAP = {"paint_fouling": "paint_peel"}

CONF_CALIBRATION = {
    "corrosion": 0.90,
    "biofouling": 0.87,
    "crack": 0.95,
    "paint_peel": 0.86,
    "debris": 0.88,
}

CLASS_NAME_REMAP = {
    "hull": "corrosion",
    "marine_growth": "biofouling",
    "fouling": "biofouling",
    "anomaly": "anomaly",
}
CLASS_SUPPRESS = {"healthy_surface"}
MAX_PER_CLASS = int(os.getenv("NAUTICAI_PRASAD_MAX_PER_CLASS", "0"))


def remap_class(name: str) -> str:
    return CLASS_NAME_REMAP.get(name.lower().strip(), name.lower().strip())


CLASS_COLORS_BGR = {
    "corrosion": (60, 76, 231),
    "biofouling": (0, 165, 240),
    "debris": (80, 180, 80),
    "anode": (34, 200, 230),
    "paint_peel": (60, 76, 231),
    "anomaly": (180, 60, 220),
    "crack": (0, 140, 255),
}
DEFAULT_COLOR_BGR = (0, 200, 176)

SPECIES_CLASSES = ["algae", "barnacles", "mussels"]

# Lazy singletons
device: torch.device = torch.device("cpu")
USE_HALF: bool = False
PRASAD_STACK_V2: bool = False
# v2: list of (YOLO, conf, stem, path)
_v2_models: List[Tuple[YOLO, float, str, str]] = []
# legacy
model_hull: Optional[YOLO] = None
model_gen: Optional[YOLO] = None
model_bio: Optional[YOLO] = None
resnet_model: Optional[torch.nn.Module] = None
resnet_transform = None
_loaded: bool = False


def prasad_weights_base_dir() -> str:
    raw = (
        os.environ.get("NAUTICAI_PRASAD_MODEL_DIR")
        or os.environ.get("NAUTICAI_PRASAD_REPO")
        or ""
    ).strip()
    if raw:
        return str(Path(raw).expanduser().resolve())
    return str((Path(__file__).resolve().parent / "prasad_models").resolve())


def _deploy_paths(base: str) -> tuple[str, str]:
    return (
        os.path.join(base, "backend_deploy_repo"),
        os.path.join(base, "nauticai_production"),
    )


def _find_model(stem: str, base: str) -> str:
    """Resolve weights; prefer .onnx over .engine over .pt."""
    deploy, prod = _deploy_paths(base)
    parts = [base, os.path.join(base, "model_2"), deploy, prod]
    for part in parts:
        for ext in (".onnx", ".engine", ".pt"):
            p = os.path.join(part, stem + ext)
            if os.path.isfile(p):
                print(f"[Prasad engine] model found: {p}")
                return p
    raise FileNotFoundError(
        f"Model '{stem}' (.onnx/.engine/.pt) not under {base} "
        "(or backend_deploy_repo / nauticai_production / model_2)."
    )


def _find_resnet(base: str) -> str:
    deploy, prod = _deploy_paths(base)
    for p in [
        os.path.join(base, "resnet50_species_full_model.pt"),
        os.path.join(base, "model_2", "resnet50_species_full_model.pt"),
        os.path.join(deploy, "resnet50_species_full_model.pt"),
        os.path.join(prod, "resnet50_species_full_model.pt"),
    ]:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(
        f"resnet50_species_full_model.pt not found under {base} "
        "(or backend_deploy_repo / nauticai_production)."
    )


def _all_v2_onnx_present(base: str) -> bool:
    try:
        for stem, _ in V2_MODELS:
            p = _find_model(stem, base)
            if not p.lower().endswith(".onnx"):
                return False
        return True
    except OSError:
        return False
    except FileNotFoundError:
        return False


def _load_yolo_path(path: str, label: str) -> Optional[YOLO]:
    try:
        m = YOLO(path, task="detect")
        if USE_HALF and path.endswith(".pt") and not path.endswith(".onnx"):
            try:
                m.model = m.model.half()
            except Exception:
                pass
        names = list(m.names.values()) if getattr(m, "names", None) else []
        print(f"[Prasad engine] {label} loaded — classes={names}")
        return m
    except Exception as e:
        print(f"[Prasad engine] WARN {label} ({path}): {e}")
        return None


def _load_yolo(stem: str, label: str, base: str) -> Optional[YOLO]:
    try:
        path = _find_model(stem, base)
        return _load_yolo_path(path, label)
    except Exception as e:
        print(f"[Prasad engine] WARN {label} ({stem}): {e}")
        return None


def ensure_prasad_models_loaded() -> None:
    """Load YOLO + ResNet once into process memory."""
    global device, USE_HALF, PRASAD_STACK_V2, _v2_models
    global model_hull, model_gen, model_bio, resnet_model, resnet_transform, _loaded
    if _loaded:
        return

    base = prasad_weights_base_dir()
    if not os.path.isdir(base):
        raise FileNotFoundError(
            f"Prasad weights directory does not exist: {base}. "
            "Set NAUTICAI_PRASAD_MODEL_DIR (or NAUTICAI_PRASAD_REPO) to the folder with the weights."
        )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    USE_HALF = bool(torch.cuda.is_available())
    print(f"[Prasad engine] device={device} FP16(legacy pt)={USE_HALF}")

    PRAD_V2 = _all_v2_onnx_present(base)
    PRASAD_STACK_V2 = PRAD_V2

    if PRAD_V2:
        _v2_models.clear()
        print("[Prasad engine] v2 ONNX five-model stack active (per MODELS_INTEGRATION_GUIDE.md)")
        for stem, conf in V2_MODELS:
            try:
                p = _find_model(stem, base)
                m = _load_yolo_path(p, stem)
                if m is not None:
                    _v2_models.append((m, conf, stem, p))
            except Exception as e:
                print(f"[Prasad engine] v2 load abort: {e}")
                PRASAD_STACK_V2 = False
                _v2_models.clear()
                break
        if len(_v2_models) != len(V2_MODELS):
            PRASAD_STACK_V2 = False
            _v2_models.clear()

    if not PRASAD_STACK_V2:
        model_hull = _load_yolo("hull_inspection_best", "HullInspection", base)
        model_gen = _load_yolo("best (3)", "GeneralHull", base)
        model_bio = _load_yolo("biofouling_best", "BiofoulingSpec", base)
        if model_hull is None and model_gen is None and model_bio is None:
            raise RuntimeError(
                f"No Prasad YOLO weights could be loaded from {base}. "
                "Add five .onnx files (hull_inspection_best, biofouling_best, crack_best, "
                "paint_fouling_best, debris_best) or legacy .pt/.engine set."
            )
    else:
        model_hull = model_gen = model_bio = None

    try:
        import torchvision.transforms as transforms

        rpath = _find_resnet(base)
        resnet_transform = transforms.Compose(
            [
                transforms.ToPILImage(),
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ]
        )
        resnet_model = torch.load(rpath, map_location=device)
        if USE_HALF:
            resnet_model = resnet_model.half()
        resnet_model.eval()
        print(f"[Prasad engine] ResNet species loaded: {rpath}")
    except Exception as e:
        print(f"[Prasad engine] WARN ResNet species disabled: {e}")
        resnet_model = None
        resnet_transform = None

    _loaded = True


def get_color(class_name: str):
    return CLASS_COLORS_BGR.get(class_name.lower().strip(), DEFAULT_COLOR_BGR)


def _top_per_class(detections: list, max_per_class: int = 0) -> list:
    if max_per_class <= 0:
        return detections
    buckets: dict[str, list] = {}
    for d in detections:
        buckets.setdefault(d["class_name"], []).append(d)
    out = []
    for cls_dets in buckets.values():
        cls_dets.sort(key=lambda x: x["confidence"], reverse=True)
        out.extend(cls_dets[:max_per_class])
    out.sort(key=lambda x: x["confidence"], reverse=True)
    return out


def draw_boxes(image_bgr: np.ndarray, detections: list) -> np.ndarray:
    img = image_bgr.copy()
    H, W = img.shape[:2]
    label_rects: list[tuple[int, int, int, int]] = []

    def _overlaps(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        return not (ax2 < bx1 or bx2 < ax1 or ay2 < by1 or by2 < ay1)

    def _place_label(x1: int, y1: int, tw: int, th: int) -> tuple[int, int, tuple[int, int, int, int]]:
        lx = max(0, min(x1, W - tw - 12))
        candidates = [max(th + 6, y1 - 6)] + [max(th + 6, y1 + (i * (th + 8))) for i in range(1, 12)]
        for ly in candidates:
            rect = (lx, ly - th - 6, lx + tw + 10, ly + 2)
            if rect[2] >= W:
                dx = rect[2] - (W - 2)
                rect = (rect[0] - dx, rect[1], rect[2] - dx, rect[3])
                lx = rect[0]
            if rect[1] < 0:
                dy = -rect[1]
                rect = (rect[0], rect[1] + dy, rect[2], rect[3] + dy)
                ly = rect[3] - 2
            if all(not _overlaps(rect, r) for r in label_rects):
                return lx, ly, rect
        ly = max(th + 6, y1 - 6)
        rect = (lx, ly - th - 6, lx + tw + 10, ly + 2)
        return lx, ly, rect

    for det in detections:
        x1, y1, x2, y2 = int(det["x1"]), int(det["y1"]), int(det["x2"]), int(det["y2"])
        label = det["class_name"]
        conf = det["confidence"]
        color = get_color(label)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        tag = f"{label}  {conf:.0%}"
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale, thick = 0.52, 1
        (tw, th), _ = cv2.getTextSize(tag, font, scale, thick)
        lx, ly, rect = _place_label(x1, y1, tw, th)
        cv2.rectangle(img, (rect[0], rect[1]), (rect[2], rect[3]), color, -1)
        cv2.putText(img, tag, (lx + 5, ly - 2), font, scale, (10, 10, 10), thick, cv2.LINE_AA)
        label_rects.append(rect)
    clabel = f"{len(detections)} detection{'s' if len(detections) != 1 else ''} found"
    (cw, ch), _ = cv2.getTextSize(clabel, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    cv2.rectangle(img, (W - cw - 20, H - ch - 16), (W - 4, H - 4), (6, 19, 32), -1)
    cv2.putText(
        img,
        clabel,
        (W - cw - 14, H - 8),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (0, 200, 176),
        1,
        cv2.LINE_AA,
    )
    return img


def _run_resnet_species(image_bgr: np.ndarray, x1, y1, x2, y2):
    if resnet_model is None or resnet_transform is None:
        return None, None
    try:
        h, w = image_bgr.shape[:2]
        cx1, cy1 = max(0, int(x1)), max(0, int(y1))
        cx2, cy2 = min(w, int(x2)), min(h, int(y2))
        if cx2 <= cx1 or cy2 <= cy1:
            return None, None
        crop_rgb = cv2.cvtColor(image_bgr[cy1:cy2, cx1:cx2], cv2.COLOR_BGR2RGB)
        inp = resnet_transform(crop_rgb).unsqueeze(0).to(device)
        if USE_HALF:
            inp = inp.half()
        with torch.no_grad():
            probs = torch.nn.functional.softmax(resnet_model(inp)[0], dim=0)
            top_prob, top_idx = torch.max(probs, 0)
        return SPECIES_CLASSES[top_idx.item()], float(round(top_prob.item(), 4))
    except Exception as e:
        print(f"[Prasad engine] ResNet species error: {e}")
        return None, None


def _run_one_model(
    yolo_model: YOLO,
    source: Any,
    conf_override: Optional[float] = None,
    *,
    half: bool,
    iou: float,
    imgsz: int,
) -> Any:
    return yolo_model.predict(
        source=source,
        conf=conf_override if conf_override is not None else YOLO_CONF,
        iou=iou,
        agnostic_nms=True,
        imgsz=imgsz,
        save=False,
        verbose=False,
        half=half,
        stream=False,
    )


def _iou(a: dict, b: dict) -> float:
    ix1 = max(a["x1"], b["x1"])
    iy1 = max(a["y1"], b["y1"])
    ix2 = min(a["x2"], b["x2"])
    iy2 = min(a["y2"], b["y2"])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    area_b = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    return inter / (area_a + area_b - inter)


def _v2_remap_class(stem: str, raw_name: str) -> Optional[str]:
    """Return display class or None to drop."""
    r = (raw_name or "").lower().strip()
    if stem == "hull_inspection_best":
        if r in CLASS_SUPPRESS or r == "healthy_surface":
            return None
        if r in HULL_REMAP:
            return HULL_REMAP[r]
        return r
    if stem == "paint_fouling_best":
        return PAINT_REMAP.get(r, r)
    return r


def _apply_fish_filters(cands: list, img_h: int, img_w: int) -> list:
    """Prasad MODELS_INTEGRATION_GUIDE.md — post-inference filters."""
    img_area = float(max(1, img_h * img_w))
    hull_has_marine_growth = any(
        d["_stem"] == "hull_inspection_best" and str(d["_raw"]).lower().strip() == "marine_growth"
        for d in cands
    )
    out = []
    for d in cands:
        stem = d["_stem"]
        raw = str(d["_raw"]).lower().strip()
        bw = max(0.0, float(d["x2"]) - float(d["x1"]))
        bh = max(0.0, float(d["y2"]) - float(d["y1"]))
        ar = (bw * bh) / img_area

        if stem == "hull_inspection_best":
            if raw == "marine_growth" and ar < 0.08:
                continue
            if raw == "debris" and hull_has_marine_growth:
                continue
        if stem == "biofouling_best":
            if ar > 0.25 or ar < 0.005 or bw < 15 or bh < 15:
                continue
        if stem == "debris_best":
            if ar < 0.10 and (img_w < 400 or img_h < 300):
                continue
        out.append(d)
    return out


def _merge_detections_v2(per_model: list[tuple[Any, str]], image_bgr: np.ndarray) -> list:
    """Parse v2 results: fish filters → remap → calibrate → NMS → species."""
    img_h, img_w = image_bgr.shape[:2]
    cands: list[dict] = []
    for result, stem in per_model:
        if result.boxes is None or len(result.boxes) == 0:
            continue
        cls_ids = result.boxes.cls.cpu().numpy().astype(int)
        confs = result.boxes.conf.cpu().numpy()
        xyxy = result.boxes.xyxy.cpu().numpy()
        for i in range(len(cls_ids)):
            raw_name = result.names[cls_ids[i]]
            x1, y1, x2, y2 = xyxy[i]
            cands.append(
                {
                    "_stem": stem,
                    "_raw": raw_name,
                    "confidence": float(round(confs[i], 4)),
                    "x1": float(x1),
                    "y1": float(y1),
                    "x2": float(x2),
                    "y2": float(y2),
                }
            )

    cands = _apply_fish_filters(cands, img_h, img_w)
    all_dets: list[dict] = []
    for d in cands:
        cls = _v2_remap_class(d["_stem"], str(d["_raw"]))
        if cls is None:
            continue
        raw_conf = d["confidence"]
        cal = CONF_CALIBRATION.get(cls, 1.0)
        conf = min(0.99, round(raw_conf * cal, 4))
        all_dets.append(
            {
                "class_name": cls,
                "confidence": conf,
                "x1": d["x1"],
                "y1": d["y1"],
                "x2": d["x2"],
                "y2": d["y2"],
            }
        )

    all_dets.sort(key=lambda d: d["confidence"], reverse=True)
    kept: list[dict] = []
    for det in all_dets:
        overlap_same_class = any(
            (det["class_name"] == k["class_name"]) and (_iou(det, k) > MERGE_IOU)
            for k in kept
        )
        if not overlap_same_class:
            kept.append(det)

    for det in kept:
        if det["class_name"] == "biofouling":
            sp, sp_conf = _run_resnet_species(
                image_bgr, det["x1"], det["y1"], det["x2"], det["y2"]
            )
            if sp:
                det["species"] = sp
                det["species_confidence"] = sp_conf
    return kept


def _merge_detections_legacy(per_model: list[tuple[Any, str]], image_bgr: np.ndarray) -> list:
    """Legacy three-model merge (global remap_class)."""
    all_dets = []
    for result, stem in per_model:
        if result.boxes is None or len(result.boxes) == 0:
            continue
        cls_ids = result.boxes.cls.cpu().numpy().astype(int)
        confs = result.boxes.conf.cpu().numpy()
        xyxy = result.boxes.xyxy.cpu().numpy()
        for i in range(len(cls_ids)):
            raw_name = result.names[cls_ids[i]]
            class_name = remap_class(raw_name)
            if class_name in CLASS_SUPPRESS or raw_name.lower() in CLASS_SUPPRESS:
                continue
            x1, y1, x2, y2 = xyxy[i]
            det = {
                "class_name": class_name,
                "confidence": float(round(confs[i], 4)),
                "x1": float(x1),
                "y1": float(y1),
                "x2": float(x2),
                "y2": float(y2),
                "_raw": raw_name,
            }
            all_dets.append(det)

    all_dets.sort(key=lambda d: d["confidence"], reverse=True)
    kept = []
    for det in all_dets:
        overlap_same_class = any(
            (det["class_name"] == k["class_name"]) and (_iou(det, k) > MERGE_IOU)
            for k in kept
        )
        if not overlap_same_class:
            kept.append(det)

    for det in kept:
        raw = det.pop("_raw", det["class_name"])
        is_bio = (
            "biofouling" in raw.lower()
            or "fouling" in raw.lower()
            or "marine_growth" in raw.lower()
        )
        if is_bio:
            sp, sp_conf = _run_resnet_species(
                image_bgr, det["x1"], det["y1"], det["x2"], det["y2"]
            )
            if sp:
                det["species"] = sp
                det["species_confidence"] = sp_conf
    return kept


def run_prasad_inference(image_bgr: np.ndarray) -> List[dict]:
    """
    Run Prasad YOLO stack on one BGR image, merge + optional species, return detection dicts.
    """
    ensure_prasad_models_loaded()
    if PRASAD_STACK_V2:
        per_model: list[tuple[Any, str]] = []
        for m, conf, stem, path in _v2_models:
            res = _run_one_model(
                m,
                image_bgr,
                conf,
                half=False,
                iou=V2_IOU,
                imgsz=V2_IMGSZ,
            )[0]
            per_model.append((res, stem))
        dets = _merge_detections_v2(per_model, image_bgr)
    else:
        res_parts: list[tuple[Any, str]] = []
        if model_hull is not None:
            res_parts.append(
                (
                    _run_one_model(
                        model_hull,
                        image_bgr,
                        YOLO_CONF,
                        half=USE_HALF,
                        iou=YOLO_IOU,
                        imgsz=YOLO_IMGSZ,
                    )[0],
                    "hull_inspection_best",
                )
            )
        if model_gen is not None:
            res_parts.append(
                (
                    _run_one_model(
                        model_gen,
                        image_bgr,
                        YOLO_CONF,
                        half=USE_HALF,
                        iou=YOLO_IOU,
                        imgsz=YOLO_IMGSZ,
                    )[0],
                    "best (3)",
                )
            )
        if model_bio is not None:
            res_parts.append(
                (
                    _run_one_model(
                        model_bio,
                        image_bgr,
                        0.15,
                        half=USE_HALF,
                        iou=YOLO_IOU,
                        imgsz=YOLO_IMGSZ,
                    )[0],
                    "biofouling_best",
                )
            )
        dets = _merge_detections_legacy(res_parts, image_bgr)
    return _top_per_class(dets, max_per_class=MAX_PER_CLASS)
