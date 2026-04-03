#!/usr/bin/env bash
# Re-install API + vision Python packages on Jetson WITHOUT touching NVIDIA torch/torchvision.
# Use when you see: ModuleNotFoundError: No module named 'fpdf' (or fastapi, cv2, etc.)
# after days away, a new shell, or forgetting to activate the venv.
#
# Before running:
#   cd "/path/to/NautiCAI_Backend"   # folder that contains nauticai_api.py
#   source .venv/bin/activate        # if you use a venv — MUST be same env as torch
#
# Then:
#   bash scripts/jetson_reinstall_python_deps.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

echo "==> Python: $(command -v python) — $(python --version 2>&1)"
echo "==> Installing requirements-jetson.txt (fpdf, fastapi, opencv, segment-anything, …)"
pip install -r requirements-jetson.txt

echo "==> ultralytics (no deps — keeps NVIDIA torch)"
pip install "ultralytics==8.4.30" --no-deps

echo "==> ultralytics runtime libraries"
pip install matplotlib pyyaml scipy pillow psutil polars ultralytics-thop

echo "==> Quick import check"
python -c "import fpdf; from fpdf import FPDF; import cv2, fastapi; print('fpdf, cv2, fastapi: OK')"

echo "==> Done. Start API: python nauticai_api.py"
