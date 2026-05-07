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

export PYTHONNOUSERSITE="${PYTHONNOUSERSITE:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

echo "==> Python: $(command -v python) — $(python --version 2>&1)"
echo "==> Polars wheel first (Jetson must not build Polars from source)"
python -m pip install --only-binary=:all: "polars>=1.8.2,<3"
echo "==> Installing requirements.jetson.txt + constraints-jetson.txt (does not reinstall torch)"
python -m pip install -r requirements.jetson.txt -c constraints-jetson.txt

echo "==> Quick import check"
python -c "import fpdf; from fpdf import FPDF; import cv2, fastapi; print('fpdf, cv2, fastapi: OK')"

echo "==> Done. Start API: ULTRALYTICS_SKIP_REQUIREMENTS_CHECKS=1 PYTHONNOUSERSITE=1 python nauticai_api.py"
