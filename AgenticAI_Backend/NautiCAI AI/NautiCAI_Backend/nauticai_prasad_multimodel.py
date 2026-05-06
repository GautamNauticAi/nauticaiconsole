"""
Prasad-style hull inspection entrypoint for NautiCAI (wrapper only).

Inference lives in nauticai_prasad_engine.py inside this repo — not by importing Prasad's api.py.

Enable with:
  NAUTICAI_HULL_ENGINE=prasad

Weights directory (same file layout as Prasad project root):
  NAUTICAI_PRASAD_MODEL_DIR=...   (preferred)
  NAUTICAI_PRASAD_REPO=...      (alias)

Default if unset: <this backend folder>/prasad_models
"""
from __future__ import annotations

import json
import os
from typing import Optional

import cv2

from nauticai_prasad_engine import PRASAD_STACK_V2, draw_boxes, run_prasad_inference


def _pseudo_coverage_percent(detections: list, image_width: int, image_height: int) -> float:
    """IMO-style coverage % from boxes (Prasad stack has no SAM union mask)."""
    if not detections or image_width <= 0 or image_height <= 0:
        return 0.0
    area = float(image_width * image_height)
    s = 0.0
    for d in detections:
        x1, y1, x2, y2 = d.get("bbox_xyxy") or [d.get("x1"), d.get("y1"), d.get("x2"), d.get("y2")]
        s += max(0.0, float(x2) - float(x1)) * max(0.0, float(y2) - float(y1))
    return round(min(100.0, 100.0 * s / area), 4)


def process_image_prasad(image_path: str, conf: float = 0.25, output_dir: Optional[str] = None) -> dict:
    """
    Run multi-YOLO + optional ResNet species; return same top-level keys as nauticai_hull_inspection.process_image.
    """
    _ = conf  # engine uses YOLO_CONF / 0.15 per model like Prasad's api
    from nauticai_hull_inspection import OUTPUT_DIR, get_severity

    if image_path is None or not os.path.isfile(image_path):
        raise FileNotFoundError(image_path)

    image_bgr = cv2.imread(image_path)
    if image_bgr is None:
        raise ValueError(
            f"Could not read image (OpenCV imread failed): {image_path!r}. "
            "Use JPEG or PNG with a valid path."
        )

    h, w = image_bgr.shape[:2]
    file_name = os.path.basename(image_path)
    base_name = os.path.splitext(file_name)[0]
    out = output_dir or OUTPUT_DIR
    os.makedirs(out, exist_ok=True)
    for sub in ("annotated", "masks", "crops", "overlay", "json"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    detections_raw = run_prasad_inference(image_bgr)
    detections_raw.sort(key=lambda d: d["confidence"], reverse=True)
    detections_raw = detections_raw[:50]

    annotated_bgr = draw_boxes(image_bgr, detections_raw)
    annotated_path = os.path.join(out, "annotated", f"{base_name}_annotated.jpg")
    cv2.imwrite(annotated_path, annotated_bgr)

    detections_data = []
    for idx, d in enumerate(detections_raw):
        x1, y1, x2, y2 = int(d["x1"]), int(d["y1"]), int(d["x2"]), int(d["y2"])
        bbox_area = max(0, x2 - x1) * max(0, y2 - y1)
        detections_data.append(
            {
                "id": idx,
                "class_name": d.get("class_name", "unknown"),
                "confidence": float(d.get("confidence", 0.0)),
                "bbox_xyxy": [x1, y1, x2, y2],
                "bbox_area_pixels": bbox_area,
                "mask_pixels": bbox_area,
                "coverage_percent_of_image": round(100.0 * bbox_area / (w * h), 4) if w * h else 0.0,
                "mask_path": None,
                "crop_path": None,
                "crop_box_xyxy": None,
                "species": d.get("species"),
                "species_confidence": d.get("species_confidence"),
            }
        )

    coverage_percent = _pseudo_coverage_percent(detections_data, w, h)
    severity = get_severity(coverage_percent)

    json_path = os.path.join(out, "json", f"{base_name}_report.json")
    report = {
        "image": file_name,
        "image_path": image_path,
        "image_width": w,
        "image_height": h,
        "image_area_pixels": w * h,
        "num_detections": len(detections_data),
        "total_fouling_pixels": int(sum(d["mask_pixels"] for d in detections_data)),
        "coverage_percent": coverage_percent,
        "severity": severity,
        "annotated_path": annotated_path,
        "overlay_path": None,
        "union_mask_path": None,
        "detections": detections_data,
        "engine": "prasad_onnx_5up_nauticai" if PRASAD_STACK_V2 else "prasad_multimodel_nauticai",
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(
        f"[Prasad hull] {file_name} | dets={len(detections_data)} | "
        f"coverage~{coverage_percent}% | severity={severity}"
    )
    return report
