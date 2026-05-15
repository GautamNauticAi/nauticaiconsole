#!/bin/sh
# Download NautiCAI model weights from a GCS bucket at container startup.
#
# Private bucket (org blocks allUsers): grant the Cloud Run service account
#   roles/storage.objectViewer on this bucket. This script uses the metadata
#   server token (Cloud Run / GCE) to call the Storage JSON API.
#
# Public bucket (local dev): unset / no token → falls back to
#   https://storage.googleapis.com/<bucket>/<object>
#
# Env:
#   GCS_MODEL_BUCKET        (default: nauticai-models-967866644933)
#   GCS_AISHWARYA_PREFIX   default aishwarya — set to Aishwarya if your folder uses that casing

# Do not use set -e: optional model files may fail; API should still start when core set loads.
AIS_PRE="${GCS_AISHWARYA_PREFIX:-aishwarya}"

# Optional OAuth token from Cloud Run / GCE metadata (Storage read scope)
get_gcs_token() {
  curl -s -f \
    -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdevstorage.read_only" \
    | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || true
}

TOKEN="$(get_gcs_token)"
if [ -n "$TOKEN" ]; then
  echo "[models] using authenticated GCS downloads (private bucket OK)"
else
  echo "[models] no metadata token — using public object URLs (local / legacy)"
fi

urlencode_object() {
  python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"
}

download_if_missing() {
  dest="$1"
  object="$2"
  if [ -f "$dest" ]; then
    echo "[models] exists: $dest"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  echo "[models] downloading: $dest  <-  gs://${BUCKET}/${object}"

  if [ -n "$TOKEN" ]; then
    enc="$(urlencode_object "$object")"
    api_url="https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${enc}?alt=media"
    curl -fSL --retry 3 --retry-delay 5 \
      -H "Authorization: Bearer ${TOKEN}" \
      -o "$dest" "$api_url"
  else
    pub_url="https://storage.googleapis.com/${BUCKET}/${object}"
    curl -fSL --retry 3 --retry-delay 5 -o "$dest" "$pub_url"
  fi
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "[models] WARN: failed to download $dest (rc=$rc)"
    rm -f "$dest"
    return 1
  fi

  echo "[models] ok: $dest"
}

# Prasad ONNX models
download_if_missing "prasad_models/hull_inspection_best.onnx" "prasad/hull_inspection_best.onnx"
download_if_missing "prasad_models/biofouling_best.onnx" "prasad/biofouling_best.onnx"
download_if_missing "prasad_models/crack_best.onnx" "prasad/crack_best.onnx"
download_if_missing "prasad_models/paint_fouling_best.onnx" "prasad/paint_fouling_best.onnx"
download_if_missing "prasad_models/debris_best.onnx" "prasad/debris_best.onnx"

# Prasad ResNet species
download_if_missing "prasad_models/resnet50_species_full_model.pt" "prasad/resnet50_species_full_model.pt"

# Prasad legacy PT (optional)
download_if_missing "prasad_models/hull_inspection_best.pt" "prasad/hull_inspection_best.pt"
download_if_missing "prasad_models/biofouling_best.pt" "prasad/biofouling_best.pt"
download_if_missing "prasad_models/best (3).pt" "prasad/best_3.pt"

# Aishwarya PT models (${AIS_PRE} matches your GCS folder name)
download_if_missing "aishwarya_models/best_subpipe_full.pt" "${AIS_PRE}/best_subpipe_full.pt"
download_if_missing "aishwarya_models/best_merged_original.pt" "${AIS_PRE}/best_merged_original.pt"
download_if_missing "aishwarya_models/best_subpipemini.pt" "${AIS_PRE}/best_subpipemini.pt"
download_if_missing "aishwarya_models/best_subpipemini2.pt" "${AIS_PRE}/best_subpipemini2.pt"
download_if_missing "aishwarya_models/best_subsea1_4class.pt" "${AIS_PRE}/best_subsea1_4class.pt"
download_if_missing "aishwarya_models/best_archive.pt" "${AIS_PRE}/best_archive.pt"

# Agentic YOLO
download_if_missing "biofouling_best.pt" "agentic/biofouling_best.pt"

echo "[models] download check complete"
