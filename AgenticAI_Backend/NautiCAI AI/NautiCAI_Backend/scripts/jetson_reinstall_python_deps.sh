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

ARCH="$(uname -m)"
PY_TAG="$(python -c "import sys; v=sys.version_info; print(f\"cp{v.major}{v.minor}\")")"

echo "==> Python: $(command -v python) — $(python --version 2>&1) — ${ARCH} ${PY_TAG}"

if [[ "${ARCH}" == aarch64 ]] && [[ "${PY_TAG}" == cp38 ]]; then
  echo "==> aarch64 + cp38: polars==0.19.12 + ultralytics --no-deps (same as install_jetson_backend.sh)"
  REQ_NO_ULTRA="$(mktemp)"
  awk '!/^ultralytics==/' requirements.jetson.txt > "${REQ_NO_ULTRA}"
  python -m pip install --only-binary=:all: "polars==0.19.12"
  python -m pip install -r "${REQ_NO_ULTRA}"
  rm -f "${REQ_NO_ULTRA}"
  python -m pip install "ultralytics==8.4.47" --no-deps
  python -m pip install \
    "matplotlib>=3.3.0" \
    "pillow>=7.1.2" \
    "pyyaml>=5.3.1" \
    "scipy>=1.4.1" \
    "psutil>=5.8.0" \
    "ultralytics-thop>=2.0.18"
else
  echo "==> Polars wheel + requirements.jetson.txt"
  python -m pip install --only-binary=:all: "polars>=1.8.2,<3" \
    || python -m pip install --only-binary=:all: "polars==1.8.2"
  python -m pip install -r requirements.jetson.txt -c constraints-jetson.txt
fi

echo "==> Quick import check"
python -c "import fpdf; from fpdf import FPDF; import cv2, fastapi; print('fpdf, cv2, fastapi: OK')"

echo "==> Done. Start API: ULTRALYTICS_SKIP_REQUIREMENTS_CHECKS=1 PYTHONNOUSERSITE=1 python nauticai_api.py"
