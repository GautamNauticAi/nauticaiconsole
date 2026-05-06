"""
Aishwarya YOLO pipeline inference, extracted into NautiCAI.

This module implements Aishwarya-style YOLO loading, class remap, and
inference in-repo so pipeline inspections run without any external
vendor tree on PYTHONPATH.

Env:
  NAUTICAI_AISHWARYA_MODEL_DIR     Folder containing Aishwarya .pt weights.
                                   Default: <this backend>/aishwarya_models
  NAUTICAI_AISHWARYA_MODEL_PATH    Optional explicit .pt path (overrides key scan).
  NAUTICAI_AISHWARYA_MODEL_KEY     Optional key from AVAILABLE_MODELS. Default: merged_original (hull).
  NAUTICAI_AISHWARYA_PIPELINE_MODEL_KEY  When inspection_source is pipeline and MODEL_KEY is unset,
                                   use this key (default: subpipe_full). Set NAUTICAI_AISHWARYA_MODEL_KEY to override.
  NAUTICAI_AISHWARYA_CONF          Default confidence threshold. Default: 0.25
  NAUTICAI_AISHWARYA_IOU           Default IoU threshold. Default: 0.45
  NAUTICAI_AISHWARYA_IMGSZ        Optional predict image size (e.g. 1280). 0 = ultralytics default.
  NAUTICAI_AISHWARYA_MIN_BOX_AREA_RATIO  Drop boxes smaller than this fraction of image area (0 = off).
  NAUTICAI_AISHWARYA_MAX_BOX_AREA_RATIO  Drop boxes larger than this fraction (default 0.5, matches upstream).

Enhancement controls (ported defaults):
  NAUTICAI_AISHWARYA_USE_CLAHE=true
  NAUTICAI_AISHWARYA_USE_GREEN=true
  NAUTICAI_AISHWARYA_USE_EDGE=false
  NAUTICAI_AISHWARYA_TURBIDITY=0.0
  NAUTICAI_AISHWARYA_CORRECT_TURBIDITY=true
  NAUTICAI_AISHWARYA_CLAHE_CLIP=3.0
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
from ultralytics import YOLO


AVAILABLE_MODELS = {
    "merged_original": "best_merged_original.pt",
    "subpipe_full": "best_subpipe_full.pt",
    "subpipemini": "best_subpipemini.pt",
    "subpipemini2": "best_subpipemini2.pt",
    "subsea1_4class": "best_subsea1_4class.pt",
    "archive": "best_archive.pt",
    "best": "best.pt",
}


SEVERITY_MAP = {
    "Corrosion": "Critical",
    "Crack": "Critical",
    "Fracture": "Critical",
    "Leakage": "Critical",
    "Marine Growth": "High",
    "Biofouling": "High",
    "Weld Defect": "High",
    "Anode Damage": "High",
    "CP Failure": "High",
    "Pitting": "Medium",
    "Paint Damage": "Medium",
    "Coating Failure": "Medium",
    "Deformation": "Medium",
    "Blockage": "Medium",
    "Dent": "Low",
    "Scaling": "Low",
    "Spalling": "Low",
    "Disbondment": "Low",
    "Foreign Object": "Low",
    "Free Span": "Critical",
    "No Defect": "Low",
}

CLASS_REMAP = {
    "pipeline": "Corrosion",
    "concrete": "Marine Growth",
    "hull": "Paint Damage",
    "propeller": "Biofouling",
    "anode": "Anode Damage",
    "leakage": "Leakage",
    "anomaly": "Crack",
    "biofouling": "Biofouling",
    "bilge_keel": "Coating Failure",
    "draft_mark": "Paint Damage",
    "ropeguard": "Foreign Object",
    "rudder": "Deformation",
    "sea_chest": "Blockage",
    "thruster_blades": "Weld Defect",
    "thruster_grating": "Disbondment",
    "flange": "Weld Defect",
    "buoy": "Foreign Object",
    "bend_restrictor": "Deformation",
    "pipe_coupling": "Coating Failure",
    "free_span": "Free Span",
    "healthy": "No Defect",
}


_model: Optional[YOLO] = None
_model_path: Optional[str] = None


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def aishwarya_weights_dir() -> str:
    raw = (os.environ.get("NAUTICAI_AISHWARYA_MODEL_DIR") or "").strip()
    if raw:
        return str(Path(raw).expanduser().resolve())
    return str((Path(__file__).resolve().parent / "aishwarya_models").resolve())


def _effective_model_key(inspection_source: Optional[str] = None) -> str:
    """
    Choose YOLO weights key when no explicit NAUTICAI_AISHWARYA_MODEL_PATH is set.
    Pipeline batches should not default to merged_original (hull-focused); use subpipe_* instead.
    """
    env_key = (os.environ.get("NAUTICAI_AISHWARYA_MODEL_KEY") or "").strip().lower()
    if env_key:
        return env_key
    src = (inspection_source or "").strip().lower()
    if src == "pipeline":
        return (
            os.environ.get("NAUTICAI_AISHWARYA_PIPELINE_MODEL_KEY") or "subpipe_full"
        ).strip().lower() or "subpipe_full"
    return "merged_original"


def _candidate_model_paths(inspection_source: Optional[str] = None) -> list[str]:
    explicit = (os.environ.get("NAUTICAI_AISHWARYA_MODEL_PATH") or "").strip()
    if explicit:
        return [str(Path(explicit).expanduser().resolve())]

    base = Path(aishwarya_weights_dir())
    key = _effective_model_key(inspection_source)
    src = (inspection_source or "").strip().lower()
    candidates: list[Path] = []

    # Pipeline: try subsea/subpipe checkpoints before merged_original. Otherwise a missing
    # best_subpipe_full.pt caused the loader to pick best_merged_original.pt next (wrong domain).
    if src == "pipeline" and not (os.environ.get("NAUTICAI_AISHWARYA_MODEL_KEY") or "").strip():
        priority_keys: list[str] = []
        for k in (
            key,
            "subpipe_full",
            "subpipemini",
            "subpipemini2",
            "subsea1_4class",
            "archive",
            "merged_original",
            "best",
        ):
            if k in AVAILABLE_MODELS and k not in priority_keys:
                priority_keys.append(k)
        for k in priority_keys:
            p = base / AVAILABLE_MODELS[k]
            if p not in candidates:
                candidates.append(p)
    else:
        if key in AVAILABLE_MODELS:
            candidates.append(base / AVAILABLE_MODELS[key])
        for rel in AVAILABLE_MODELS.values():
            p = base / rel
            if p not in candidates:
                candidates.append(p)
    for name in ("best.pt", "yolov8s.pt", "yolov8n.pt"):
        p = base / name
        if p not in candidates:
            candidates.append(p)
    return [str(p.resolve()) for p in candidates]


def ensure_aishwarya_model_loaded(inspection_source: Optional[str] = None) -> tuple[YOLO, str]:
    global _model, _model_path
    checked: list[str] = []
    selected: Optional[str] = None
    for p in _candidate_model_paths(inspection_source):
        checked.append(p)
        if os.path.isfile(p):
            selected = p
            break
    if not selected:
        raise FileNotFoundError(
            "Aishwarya model file not found. Set NAUTICAI_AISHWARYA_MODEL_DIR (or "
            "NAUTICAI_AISHWARYA_MODEL_PATH). Checked: " + ", ".join(checked)
        )
    if _model is not None and _model_path == selected:
        return _model, _model_path
    _model = YOLO(selected)
    _model_path = selected
    print(f"[Aishwarya engine] loaded model: {selected}")
    return _model, _model_path


def _apply_enhancement(image_bgr: np.ndarray) -> np.ndarray:
    out = image_bgr.copy()
    use_clahe = _env_bool("NAUTICAI_AISHWARYA_USE_CLAHE", True)
    use_green = _env_bool("NAUTICAI_AISHWARYA_USE_GREEN", True)
    use_edge = _env_bool("NAUTICAI_AISHWARYA_USE_EDGE", False)
    correct_turb = _env_bool("NAUTICAI_AISHWARYA_CORRECT_TURBIDITY", True)
    turb = float((os.environ.get("NAUTICAI_AISHWARYA_TURBIDITY") or "0.0").strip() or "0.0")
    clahe_clip = float((os.environ.get("NAUTICAI_AISHWARYA_CLAHE_CLIP") or "3.0").strip() or "3.0")

    if turb > 0.01:
        blur = cv2.GaussianBlur(out, (0, 0), sigmaX=turb * 12)
        out = cv2.addWeighted(out, 1 - turb * 0.7, blur, turb * 0.7, 0)
        if correct_turb:
            f = out.astype(np.float32)
            f[:, :, 0] = np.clip(f[:, :, 0] / max(0.01, 1 - turb * 0.2), 0, 255)
            f[:, :, 1] = np.clip(f[:, :, 1] / max(0.01, 1 + turb * 0.35), 0, 255)
            f[:, :, 2] = np.clip(f[:, :, 2] / max(0.01, 1 - turb * 0.3), 0, 255)
            out = np.clip(f / max(0.01, 1 - turb * 0.25), 0, 255).astype(np.uint8)

    if use_green:
        f = out.astype(np.float32)
        f[:, :, 1] = np.clip(f[:, :, 1] * 1.24, 0, 255)
        f[:, :, 0] = np.clip(f[:, :, 0] * 0.82, 0, 255)
        f[:, :, 2] = np.clip(f[:, :, 2] * 1.09, 0, 255)
        out = f.astype(np.uint8)

    if use_clahe:
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8)).apply(l)
        out = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    if use_edge:
        gray = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        ec = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
        ec[:, :, 0] = 0
        ec[:, :, 2] = 0
        ec[:, :, 1] = edges
        out = cv2.addWeighted(out, 0.75, ec, 0.8, 0)

    return out


def _remap_class(raw_name: str) -> str:
    k = (raw_name or "").strip()
    if not k:
        return "Unknown"
    return CLASS_REMAP.get(k, CLASS_REMAP.get(k.lower(), k))


def run_aishwarya_inference(
    image_bgr: Any,
    conf_thr: Optional[float] = None,
    iou_thr: Optional[float] = None,
    inspection_source: Optional[str] = None,
) -> tuple[list[dict], np.ndarray, str]:
    """
    Run enhanced-image YOLO inference.
    Returns: (detections, enhanced_bgr, model_path)
    """
    model, model_path = ensure_aishwarya_model_loaded(inspection_source=inspection_source)
    conf = conf_thr if conf_thr is not None else float(
        (os.environ.get("NAUTICAI_AISHWARYA_CONF") or "0.25").strip() or "0.25"
    )
    iou = iou_thr if iou_thr is not None else float(
        (os.environ.get("NAUTICAI_AISHWARYA_IOU") or "0.45").strip() or "0.45"
    )

    enhanced = _apply_enhancement(np.asarray(image_bgr))
    imgsz_raw = (os.environ.get("NAUTICAI_AISHWARYA_IMGSZ") or "0").strip() or "0"
    imgsz = int(imgsz_raw)
    pred_kw = {"conf": conf, "iou": iou, "verbose": False}
    if imgsz > 0:
        pred_kw["imgsz"] = imgsz
    result = model.predict(enhanced, **pred_kw)[0]

    h, w = enhanced.shape[:2]
    img_area = float(max(1, h * w))
    min_ratio = float((os.environ.get("NAUTICAI_AISHWARYA_MIN_BOX_AREA_RATIO") or "0").strip() or "0")
    max_ratio = float((os.environ.get("NAUTICAI_AISHWARYA_MAX_BOX_AREA_RATIO") or "0.5").strip() or "0.5")

    detections: list[dict] = []
    if result.boxes is None or len(result.boxes) == 0:
        return detections, enhanced, model_path

    for box in result.boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        confidence = float(box.conf[0])
        cls_idx = int(box.cls[0])
        raw_name = str(model.names.get(cls_idx, "unknown"))
        class_name = _remap_class(raw_name)
        area = max(0, x2 - x1) * max(0, y2 - y1)
        area_ratio = area / img_area
        # Upstream Aishwarya used 0.5% min area — that drops most small subsea defects in NautiCAI reports.
        if max_ratio > 0 and area_ratio > max_ratio:
            continue
        if min_ratio > 0 and area_ratio < min_ratio:
            continue
        detections.append(
            {
                "class_name": class_name,
                "severity": SEVERITY_MAP.get(class_name, "Medium"),
                "raw_class_name": raw_name,
                "confidence": confidence,
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "bbox_area_pixels": area,
            }
        )
    return detections, enhanced, model_path

