"""
NautiCAI – AI Vision pipeline for maritime hull inspection (biofouling detection).
Uses YOLO for detection + SAM for segmentation → coverage % and severity per image.
"""
import os
import platform
import sys

# Jetson L4T: CUDA user libs before torch loads.
if sys.platform.startswith("linux"):
    for _tegra_path in (
        "/usr/lib/aarch64-linux-gnu/tegra",
        "/usr/lib/aarch64-linux-gnu/tegra-egl",
        "/usr/local/cuda/lib64",
    ):
        if _tegra_path and os.path.isdir(_tegra_path):
            _cur = os.environ.get("LD_LIBRARY_PATH", "")
            _parts = _cur.split(":") if _cur else []
            if _tegra_path not in _parts:
                os.environ["LD_LIBRARY_PATH"] = (
                    f"{_tegra_path}:{_cur}" if _cur else _tegra_path
                )

import cv2
import json
import tempfile
import torch
import numpy as np


def _is_jetson_like() -> bool:
    """
    Jetson / Tegra edge devices need fewer video frames and smaller tensors than a desktop GPU server.
    Override with NAUTICAI_DEVICE_PROFILE=jetson|server|desktop.
    """
    prof = (os.environ.get("NAUTICAI_DEVICE_PROFILE") or "").strip().lower()
    if prof == "jetson":
        return True
    if prof in ("server", "desktop", "gpu"):
        return False
    if os.path.isfile("/etc/nv_tegra_release"):
        return True
    if platform.machine() != "aarch64":
        return False
    try:
        with open("/proc/device-tree/model", "rb") as f:
            model = f.read().decode("utf-8", errors="ignore").lower()
        return "jetson" in model or "tegra" in model
    except OSError:
        return False


def _patch_torchvision_nms_if_broken() -> None:
    """
    Ultralytics YOLO calls torchvision.ops.nms (and sometimes batched_nms). On Jetson,
    PyPI torchvision is built for stock PyTorch; NVIDIA's torch wheel breaks C++ ops.
    Install pure-Python fallbacks when the default ops fail to load.
    """
    try:
        import torchvision.ops as _tv_ops

        _b = torch.tensor([[0.0, 0.0, 1.0, 1.0], [0.1, 0.1, 1.1, 1.1]], dtype=torch.float32)
        _s = torch.tensor([0.9, 0.8], dtype=torch.float32)
        _tv_ops.nms(_b, _s, 0.5)
    except Exception:
        import torchvision.ops as _tv_ops

        def _nms_pure_torch(
            boxes: torch.Tensor, scores: torch.Tensor, iou_threshold: float
        ) -> torch.Tensor:
            if boxes.numel() == 0:
                return torch.empty((0,), dtype=torch.long, device=boxes.device)
            x1, y1, x2, y2 = boxes.unbind(dim=1)
            areas = (x2 - x1).clamp(min=0) * (y2 - y1).clamp(min=0)
            order = scores.argsort(descending=True)
            keep = []
            while order.numel() > 0:
                i = order[0]
                keep.append(i)
                if order.numel() == 1:
                    break
                rest = order[1:]
                xx1 = x1[rest].clamp(min=x1[i])
                yy1 = y1[rest].clamp(min=y1[i])
                xx2 = x2[rest].clamp(max=x2[i])
                yy2 = y2[rest].clamp(max=y2[i])
                inter = (xx2 - xx1).clamp(min=0) * (yy2 - yy1).clamp(min=0)
                iou = inter / (areas[i] + areas[rest] - inter + 1e-7)
                order = rest[iou <= iou_threshold]

            return torch.stack(keep) if keep else torch.empty(0, dtype=torch.long, device=boxes.device)

        def _batched_nms_pure_torch(
            boxes: torch.Tensor,
            scores: torch.Tensor,
            idxs: torch.Tensor,
            iou_threshold: float,
        ) -> torch.Tensor:
            if boxes.numel() == 0:
                return torch.empty((0,), dtype=torch.long, device=boxes.device)
            out = []
            for c in torch.unique(idxs):
                m = idxs == c
                b = boxes[m]
                s = scores[m]
                orig = torch.nonzero(m, as_tuple=False).squeeze(1)
                sub = _nms_pure_torch(b, s, iou_threshold)
                out.append(orig[sub])
            if not out:
                return torch.empty((0,), dtype=torch.long, device=boxes.device)
            return torch.cat(out)

        _tv_ops.nms = _nms_pure_torch  # type: ignore[assignment]
        _tv_ops.batched_nms = _batched_nms_pure_torch  # type: ignore[assignment]
        print(
            "[NautiCAI] torchvision.ops NMS unavailable (Jetson/torch mismatch); using PyTorch fallbacks."
        )


_patch_torchvision_nms_if_broken()

from ultralytics import YOLO
from segment_anything import sam_model_registry, SamPredictor

# =========================
# CONFIG (set these or pass to run_pipeline)
# =========================
YOLO_MODEL_PATH = os.environ.get("NAUTICAI_YOLO_PATH", "biofouling_best.pt")
SAM_CHECKPOINT_PATH = os.environ.get("NAUTICAI_SAM_PATH", "sam_checkpoints/sam_vit_b_01ec64.pth")
OUTPUT_DIR = os.environ.get("NAUTICAI_OUTPUT_DIR", "pipeline_outputs")
# Cap image max side (px) for inference to speed up; 0 = no resize. e.g. 1280 for faster runs.
MAX_INFERENCE_SIZE = int(os.environ.get("NAUTICAI_MAX_INFERENCE_SIZE", "0") or "0")

# Resolved in load_models() so CUDA is checked when weights load (import-time can be wrong on some Jetsons).
DEVICE = "cpu"

# Globals set by load_models()
yolo_model = None
sam_predictor = None


def get_image_paths(input_source):
    """Collect all image file paths under a directory (recursive)."""
    valid_ext = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
    paths = []
    for root, _, files in os.walk(input_source):
        for f in files:
            if f.lower().endswith(valid_ext):
                paths.append(os.path.join(root, f))
    return sorted(paths)


def compute_iou(boxA, boxB):
    """Intersection-over-union of two boxes [x1,y1,x2,y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interW = max(0, xB - xA)
    interH = max(0, yB - yA)
    interArea = interW * interH
    boxAArea = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxBArea = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])
    union = boxAArea + boxBArea - interArea
    return interArea / union if union > 0 else 0.0


def non_max_suppression_boxes(boxes, scores, iou_threshold=0.5):
    """Return indices of boxes to keep after NMS."""
    if len(boxes) == 0:
        return []
    indices = np.argsort(scores)[::-1]
    keep = []
    while len(indices) > 0:
        current = indices[0]
        keep.append(int(current))
        rest = indices[1:]
        filtered = [idx for idx in rest if compute_iou(boxes[current], boxes[idx]) < iou_threshold]
        indices = np.array(filtered)
    return keep


def draw_mask_overlay(image_bgr, mask, color=(0, 255, 255), alpha=0.45):
    """Draw mask on BGR image with given color and alpha. Returns new BGR image."""
    overlay = image_bgr.copy()
    overlay[mask > 0] = (alpha * np.array(color) + (1 - alpha) * overlay[mask > 0]).astype(np.uint8)
    return overlay


def crop_from_mask(image_bgr, mask):
    """Crop image to bounding box of mask. Returns (crop_bgr, (x1,y1,x2,y2)) or None."""
    ys, xs = np.where(mask > 0)
    if len(xs) == 0 or len(ys) == 0:
        return None
    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())
    return image_bgr[y1 : y2 + 1, x1 : x2 + 1], (x1, y1, x2, y2)


def get_severity(coverage_percent):
    """Map coverage percentage to severity label."""
    if coverage_percent < 5:
        return "Low"
    if coverage_percent < 15:
        return "Medium"
    return "High"


def load_models(yolo_path=None, sam_path=None):
    """Load YOLO and SAM models. Call once before process_image."""
    global yolo_model, sam_predictor, DEVICE
    yolo_path = yolo_path or YOLO_MODEL_PATH
    sam_path = sam_path or SAM_CHECKPOINT_PATH
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    if DEVICE == "cpu":
        print("[NautiCAI] Running on CPU – detection will be slower. GPU (CUDA) recommended.")
    yolo_model = YOLO(yolo_path)
    sam = sam_model_registry["vit_b"](checkpoint=sam_path)
    sam.to(device=DEVICE)
    sam_predictor = SamPredictor(sam)
    return yolo_model, sam_predictor


def process_image(image_path, conf=0.25, output_dir=None):
    """
    Run full pipeline on one image: YOLO detect → SAM segment → coverage & report.
    Writes annotated, overlay, masks, crops, and per-image JSON under output_dir.

    Why it can be slow:
    - SAM (Segment Anything) runs one forward pass per detection; ViT-B is heavy (especially on CPU).
    - No GPU: both YOLO and SAM run on CPU → much slower.
    - Large images: full-resolution encoding in SAM is costly.
    Set NAUTICAI_MAX_INFERENCE_SIZE=1280 (or 1024) to cap image size and speed up.
    """
    if yolo_model is None or sam_predictor is None:
        raise RuntimeError("Call load_models() first.")
    out = output_dir or OUTPUT_DIR
    os.makedirs(out, exist_ok=True)
    for sub in ("annotated", "masks", "crops", "overlay", "json"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    file_name = os.path.basename(image_path)
    base_name = os.path.splitext(file_name)[0]

    image_bgr = cv2.imread(image_path)
    if image_bgr is None:
        raise ValueError(
            f"Could not read image (OpenCV imread failed): {image_path!r}. "
            "Use JPEG or PNG; avoid broken paths. On Linux, spaces/special names in temp paths can fail — API should save uploads with a safe filename."
        )

    h0, w0 = image_bgr.shape[:2]
    scale = 1.0
    if MAX_INFERENCE_SIZE > 0 and max(h0, w0) > MAX_INFERENCE_SIZE:
        scale = MAX_INFERENCE_SIZE / max(h0, w0)
        new_w = int(round(w0 * scale))
        new_h = int(round(h0 * scale))
        image_bgr = cv2.resize(image_bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    h, w = image_bgr.shape[:2]
    image_area = h * w

    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    sam_predictor.set_image(image_rgb)

    results = yolo_model.predict(
        source=image_bgr,
        conf=conf,
        verbose=False,
        device=0 if DEVICE == "cuda" else "cpu",
    )
    result = results[0]

    boxes, scores, classes = [], [], []
    if result.boxes is not None and len(result.boxes) > 0:
        for box, score, cls_id in zip(
            result.boxes.xyxy.cpu().numpy(),
            result.boxes.conf.cpu().numpy(),
            result.boxes.cls.cpu().numpy(),
        ):
            x1, y1, x2, y2 = map(int, box)
            boxes.append([x1, y1, x2, y2])
            scores.append(float(score))
            classes.append(int(cls_id))

    if len(boxes) == 0:
        return {
            "image": file_name,
            "image_path": image_path,
            "image_width": w,
            "image_height": h,
            "image_area_pixels": image_area,
            "num_detections": 0,
            "total_fouling_pixels": 0,
            "coverage_percent": 0.0,
            "severity": get_severity(0.0),
            "annotated_path": None,
            "overlay_path": None,
            "union_mask_path": None,
            "detections": [],
        }

    keep = non_max_suppression_boxes(boxes, scores, iou_threshold=0.5)
    boxes = [boxes[i] for i in keep]
    scores = [scores[i] for i in keep]
    classes = [classes[i] for i in keep]

    annotated = image_bgr.copy()
    overlay = image_bgr.copy()
    union_mask = np.zeros((h, w), dtype=np.uint8)
    detections_data = []

    for idx, (box, score, cls_id) in enumerate(zip(boxes, scores, classes)):
        x1, y1, x2, y2 = box
        input_box = np.array([x1, y1, x2, y2])
        masks, _, _ = sam_predictor.predict(box=input_box, multimask_output=False)
        mask = masks[0].astype(np.uint8)
        union_mask = np.maximum(union_mask, mask)

        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(annotated, f"biofouling {score:.2f}", (x1, max(25, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        overlay = draw_mask_overlay(overlay, mask, color=(0, 255, 255), alpha=0.4)

        mask_path = os.path.join(out, "masks", f"{base_name}_mask_{idx}.png")
        cv2.imwrite(mask_path, mask * 255)

        crop_result = crop_from_mask(image_bgr, mask)
        crop_path = None
        crop_box = None
        if crop_result is not None:
            crop_img, crop_box = crop_result
            crop_path = os.path.join(out, "crops", f"{base_name}_crop_{idx}.png")
            cv2.imwrite(crop_path, crop_img)
            crop_box = list(crop_box)

        mask_pixels = int(mask.sum())
        bbox_area = (x2 - x1) * (y2 - y1)
        detection_coverage = (mask_pixels / image_area) * 100
        detections_data.append({
            "id": idx,
            "class_name": "biofouling",
            "confidence": round(float(score), 4),
            "bbox_xyxy": [x1, y1, x2, y2],
            "bbox_area_pixels": bbox_area,
            "mask_pixels": mask_pixels,
            "coverage_percent_of_image": round(float(detection_coverage), 4),
            "mask_path": mask_path,
            "crop_path": crop_path,
            "crop_box_xyxy": crop_box,
        })

    total_fouling_pixels = int(union_mask.sum())
    coverage_percent = (total_fouling_pixels / image_area) * 100
    severity = get_severity(coverage_percent)

    annotated_path = os.path.join(out, "annotated", f"{base_name}_annotated.jpg")
    overlay_path = os.path.join(out, "overlay", f"{base_name}_overlay.jpg")
    union_mask_path = os.path.join(out, "masks", f"{base_name}_union_mask.png")
    json_path = os.path.join(out, "json", f"{base_name}_report.json")

    cv2.imwrite(annotated_path, annotated)
    cv2.imwrite(overlay_path, overlay)
    cv2.imwrite(union_mask_path, union_mask * 255)

    report = {
        "image": file_name,
        "image_path": image_path,
        "image_width": w,
        "image_height": h,
        "image_area_pixels": image_area,
        "num_detections": len(detections_data),
        "total_fouling_pixels": total_fouling_pixels,
        "coverage_percent": round(float(coverage_percent), 4),
        "severity": severity,
        "annotated_path": annotated_path,
        "overlay_path": overlay_path,
        "union_mask_path": union_mask_path,
        "detections": detections_data,
    }
    with open(json_path, "w") as f:
        json.dump(report, f, indent=4)

    print(f"Done: {file_name} | Detections: {len(detections_data)} | Coverage: {coverage_percent:.2f}% | Severity: {severity}")
    return report


def extract_video_frame_paths(video_path: str) -> list:
    """
    Sample JPEG frame paths from a video for inspection. Caller must delete each path after use.
    Uses sequential decode + stride from FPS × NAUTICAI_VIDEO_FRAME_INTERVAL_SEC.

    Jetson defaults (when env vars are unset and device is detected as Jetson/Tegra):
    fewer frames, longer interval, downscale frames — YOLO+SAM per frame is heavy on Xavier/Orin Nano.

    Env:
      NAUTICAI_VIDEO_MAX_FRAMES — cap sampled frames (default 6 Jetson / 10 else, max 60).
      NAUTICAI_VIDEO_FRAME_INTERVAL_SEC — seconds between samples (default 2.5 Jetson / 1.5 else).
      NAUTICAI_VIDEO_MAX_SIDE — if > 0, resize frame so max(width,height) <= this (default 1280 Jetson / 0=off else).
      NAUTICAI_DEVICE_PROFILE — jetson | server | desktop (overrides auto-detection).
    """
    jetson = _is_jetson_like()

    raw_mf = os.environ.get("NAUTICAI_VIDEO_MAX_FRAMES")
    if raw_mf is not None and str(raw_mf).strip() != "":
        max_frames = int(raw_mf)
    else:
        max_frames = 6 if jetson else 10
    max_frames = max(1, min(max_frames, 60))

    raw_iv = os.environ.get("NAUTICAI_VIDEO_FRAME_INTERVAL_SEC")
    if raw_iv is not None and str(raw_iv).strip() != "":
        interval_sec = float(raw_iv)
    else:
        interval_sec = 2.5 if jetson else 1.5
    if interval_sec <= 0:
        interval_sec = 2.5 if jetson else 1.5

    raw_side = os.environ.get("NAUTICAI_VIDEO_MAX_SIDE")
    if raw_side is not None and str(raw_side).strip() != "":
        max_side = int(raw_side)
    else:
        max_side = 1280 if jetson else 0

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path!r}")

    if jetson:
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if fps <= 0.1:
        fps = 25.0
    frame_stride = max(1, int(round(fps * interval_sec)))

    out = []
    frame_idx = 0
    try:
        while len(out) < max_frames:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            if frame_idx % frame_stride == 0:
                if max_side > 0:
                    h, w = frame.shape[:2]
                    m = max(h, w)
                    if m > max_side:
                        scale = max_side / float(m)
                        frame = cv2.resize(
                            frame,
                            (int(round(w * scale)), int(round(h * scale))),
                            interpolation=cv2.INTER_AREA,
                        )
                fd, tmp_path = tempfile.mkstemp(suffix=".jpg", prefix="nauticai_vid_")
                os.close(fd)
                jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), 88]
                if not cv2.imwrite(tmp_path, frame, jpeg_params) and not cv2.imwrite(
                    tmp_path, frame
                ):
                    os.unlink(tmp_path)
                    raise ValueError("Failed to write extracted video frame to disk.")
                out.append(tmp_path)
            frame_idx += 1
    finally:
        cap.release()

    if jetson and out:
        print(
            f"[NautiCAI] Video: sampled {len(out)} frame(s), stride≈{frame_stride}f, "
            f"interval={interval_sec}s, max_side={max_side or 'off'}"
        )

    if not out:
        raise ValueError(
            "No frames could be read from the video (empty, corrupt, or unsupported codec)."
        )
    return out


def run_pipeline(input_source, output_dir=None, conf=0.25, yolo_path=None, sam_path=None):
    """
    Load models, process all images under input_source, write summary.json and summary.csv.
    input_source: path to a folder of images (or folder containing subfolders of images).
    """
    load_models(yolo_path=yolo_path, sam_path=sam_path)
    out = output_dir or OUTPUT_DIR
    os.makedirs(out, exist_ok=True)
    for sub in ("annotated", "masks", "crops", "overlay", "json"):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    paths = get_image_paths(input_source)
    print(f"Total images found: {len(paths)}")
    all_reports = []
    for img_path in paths:
        try:
            report = process_image(img_path, conf=conf, output_dir=out)
        except ValueError as e:
            print(f"Skip {img_path}: {e}")
            continue
        all_reports.append(report)

    summary_path = os.path.join(out, "summary.json")
    with open(summary_path, "w") as f:
        json.dump(all_reports, f, indent=4)

    csv_path = os.path.join(out, "summary.csv")
    with open(csv_path, "w") as f:
        f.write("image,num_detections,coverage_percent,severity\n")
        for r in all_reports:
            f.write(f"{r['image']},{r['num_detections']},{r['coverage_percent']},{r['severity']}\n")

    print(f"Summary saved: {summary_path}, {csv_path}")
    return all_reports


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="NautiCAI hull inspection pipeline")
    p.add_argument("input", help="Folder containing images")
    p.add_argument("-o", "--output", default=OUTPUT_DIR, help="Output directory")
    p.add_argument("--yolo", default=YOLO_MODEL_PATH, help="Path to biofouling_best.pt")
    p.add_argument("--sam", default=SAM_CHECKPOINT_PATH, help="Path to sam_vit_b_01ec64.pth")
    p.add_argument("--conf", type=float, default=0.25, help="YOLO confidence threshold")
    args = p.parse_args()
    run_pipeline(args.input, output_dir=args.output, conf=args.conf, yolo_path=args.yolo, sam_path=args.sam)
