"""
Aishwarya pipeline wrapper for NautiCAI.

Returns the same report shape as nauticai_hull_inspection.process_image so
API + PDF + OpenClaw batch flow can route pipeline images to this engine.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import cv2

from nauticai_aishwarya_engine import run_aishwarya_inference


SEV_COLOR_BGR = {
    "Critical": (0, 0, 220),
    "High": (0, 100, 255),
    "Medium": (0, 180, 255),
    "Low": (50, 200, 50),
}


def _pseudo_coverage_percent(detections: list, image_width: int, image_height: int) -> float:
    if not detections or image_width <= 0 or image_height <= 0:
        return 0.0
    area = float(image_width * image_height)
    s = 0.0
    for d in detections:
        s += max(0.0, float(d["x2"]) - float(d["x1"])) * max(0.0, float(d["y2"]) - float(d["y1"]))
    return round(min(100.0, 100.0 * s / area), 4)


def _draw_detections(image_bgr, detections: list) -> "cv2.Mat":
    annotated = image_bgr.copy()
    for idx, d in enumerate(detections, start=1):
        x1, y1, x2, y2 = int(d["x1"]), int(d["y1"]), int(d["x2"]), int(d["y2"])
        sev = d.get("severity", "Medium")
        color = SEV_COLOR_BGR.get(sev, (0, 200, 176))
        cls = d.get("class_name", "Unknown")
        conf = float(d.get("confidence", 0.0))
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"[{idx:02d}] {cls} {conf * 100:.0f}%"
        cv2.putText(
            annotated,
            label,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2,
            cv2.LINE_AA,
        )
    return annotated


def process_image_aishwarya(
    image_path: str,
    conf: float = 0.25,
    output_dir: Optional[str] = None,
    inspection_source: Optional[str] = None,
) -> dict:
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
    out = str(Path(output_dir or OUTPUT_DIR).expanduser().resolve())
    os.makedirs(out, exist_ok=True)
    for sub in ("annotated", "masks", "crops", "overlay", "json"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    dets_raw, enhanced_bgr, model_path = run_aishwarya_inference(
        image_bgr=image_bgr,
        conf_thr=conf,
        inspection_source=inspection_source,
    )
    detections_data = []
    for idx, d in enumerate(dets_raw):
        x1, y1, x2, y2 = int(d["x1"]), int(d["y1"]), int(d["x2"]), int(d["y2"])
        bbox_area = max(0, x2 - x1) * max(0, y2 - y1)
        detections_data.append(
            {
                "id": idx,
                "class_name": d.get("class_name", "Unknown"),
                "raw_class_name": d.get("raw_class_name"),
                "severity": d.get("severity", "Medium"),
                "confidence": float(d.get("confidence", 0.0)),
                "bbox_xyxy": [x1, y1, x2, y2],
                "bbox_area_pixels": bbox_area,
                "mask_pixels": bbox_area,
                "coverage_percent_of_image": round(100.0 * bbox_area / (w * h), 4) if w * h else 0.0,
                "mask_path": None,
                "crop_path": None,
                "crop_box_xyxy": None,
            }
        )

    coverage_percent = _pseudo_coverage_percent(dets_raw, w, h)
    severity = get_severity(coverage_percent)
    annotated_bgr = _draw_detections(enhanced_bgr, dets_raw)
    annotated_path = os.path.join(out, "annotated", f"{base_name}_annotated.jpg")
    cv2.imwrite(annotated_path, annotated_bgr)

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
        "engine": "aishwarya_yolov8_nauticai",
        "model_path": model_path,
    }
    json_path = os.path.join(out, "json", f"{base_name}_report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(
        f"[Aishwarya pipeline] {file_name} | dets={len(detections_data)} | "
        f"coverage~{coverage_percent}% | severity={severity}"
    )
    return report

