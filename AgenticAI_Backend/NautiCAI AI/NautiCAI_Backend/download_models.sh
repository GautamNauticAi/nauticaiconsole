#!/bin/sh
# Download NautiCAI model weights from a public GCS bucket at container startup.
# Set GCS_MODEL_BUCKET env var to your bucket name (default: nauticai-models-967866644933).
# Files are downloaded only if missing locally (idempotent).

BUCKET="${GCS_MODEL_BUCKET:-nauticai-models-967866644933}"
BASE_URL="https://storage.googleapis.com/${BUCKET}"

download_if_missing() {
    local dest="$1"
    local url="$2"
    if [ -f "$dest" ]; then
        echo "[models] exists: $dest"
        return 0
    fi
    mkdir -p "$(dirname "$dest")"
    echo "[models] downloading: $dest"
    curl -fSL --retry 3 --retry-delay 5 -o "$dest" "$url"
    if [ $? -ne 0 ]; then
        echo "[models] WARN: failed to download $dest"
        rm -f "$dest"
        return 1
    fi
    echo "[models] ok: $dest"
}

# Prasad ONNX models
download_if_missing "prasad_models/hull_inspection_best.onnx"   "${BASE_URL}/prasad/hull_inspection_best.onnx"
download_if_missing "prasad_models/biofouling_best.onnx"        "${BASE_URL}/prasad/biofouling_best.onnx"
download_if_missing "prasad_models/crack_best.onnx"             "${BASE_URL}/prasad/crack_best.onnx"
download_if_missing "prasad_models/paint_fouling_best.onnx"     "${BASE_URL}/prasad/paint_fouling_best.onnx"
download_if_missing "prasad_models/debris_best.onnx"            "${BASE_URL}/prasad/debris_best.onnx"

# Prasad ResNet species
download_if_missing "prasad_models/resnet50_species_full_model.pt" "${BASE_URL}/prasad/resnet50_species_full_model.pt"

# Prasad legacy PT (optional, used if ONNX missing)
download_if_missing "prasad_models/hull_inspection_best.pt"     "${BASE_URL}/prasad/hull_inspection_best.pt"
download_if_missing "prasad_models/biofouling_best.pt"          "${BASE_URL}/prasad/biofouling_best.pt"
download_if_missing "prasad_models/best (3).pt"                 "${BASE_URL}/prasad/best_3.pt"

# Aishwarya PT models
download_if_missing "aishwarya_models/best_subpipe_full.pt"     "${BASE_URL}/aishwarya/best_subpipe_full.pt"
download_if_missing "aishwarya_models/best_merged_original.pt"  "${BASE_URL}/aishwarya/best_merged_original.pt"
download_if_missing "aishwarya_models/best_subpipemini.pt"      "${BASE_URL}/aishwarya/best_subpipemini.pt"
download_if_missing "aishwarya_models/best_subpipemini2.pt"     "${BASE_URL}/aishwarya/best_subpipemini2.pt"
download_if_missing "aishwarya_models/best_subsea1_4class.pt"   "${BASE_URL}/aishwarya/best_subsea1_4class.pt"
download_if_missing "aishwarya_models/best_archive.pt"          "${BASE_URL}/aishwarya/best_archive.pt"

# Agentic YOLO (biofouling_best.pt in app root)
download_if_missing "biofouling_best.pt"                        "${BASE_URL}/agentic/biofouling_best.pt"

echo "[models] download check complete"
