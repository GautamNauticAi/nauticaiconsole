#!/usr/bin/env bash
# Jetson: NVIDIA PyTorch wheel MUST match your Python minor version (cp38 vs cp310).
# - JetPack 5.x / Ubuntu 20.04: often python3 → 3.8  → v511 torch 2.0 wheel
# - JetPack 6.x / Ubuntu 22.04: often python3 → 3.10 → v60 torch 2.4 wheel
#
# Override wheel URL if needed:
#   export NV_TORCH_URL="https://developer.download.nvidia.com/...your.whl"
#   bash scripts/install_jetson_backend.sh
#
# To force Python 3.8 on JP5 (when both exist):
#   python3.8 -m venv .venv && source .venv/bin/activate && bash scripts/install_jetson_backend.sh
set -euo pipefail

export PYTHONNOUSERSITE="${PYTHONNOUSERSITE:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

PY_TAG="$(python -c "import sys; v=sys.version_info; print(f\"cp{v.major}{v.minor}\")")"
echo "==> Active Python: $(python -c "import sys; print(sys.executable)") — tag ${PY_TAG}"

if [[ -n "${NV_TORCH_URL:-}" ]]; then
  echo "==> Using NV_TORCH_URL from environment"
elif [[ "${PY_TAG}" == "cp38" ]]; then
  echo "==> JetPack 5 style: torch 2.0 (cp38) + torchvision 0.15.2"
  NV_TORCH_URL="https://developer.download.nvidia.com/compute/redist/jp/v511/pytorch/torch-2.0.0+nv23.05-cp38-cp38-linux_aarch64.whl"
  TORCHVISION_SPEC="torchvision==0.15.2"
elif [[ "${PY_TAG}" == "cp310" ]]; then
  echo "==> JetPack 6 style: torch 2.4 (cp310) + torchvision 0.19.0"
  echo "    (If this wheel fails, your JetPack may differ — set NV_TORCH_URL to a wheel from"
  echo "     https://developer.download.nvidia.com/compute/redist/jp/v60/pytorch/ or v61)"
  NV_TORCH_URL="https://developer.download.nvidia.com/compute/redist/jp/v60/pytorch/torch-2.4.0a0+3bcc3cddb5.nv24.07.16234504-cp310-cp310-linux_aarch64.whl"
  TORCHVISION_SPEC="torchvision==0.19.0"
else
  echo "ERROR: No default NVIDIA wheel for Python tag ${PY_TAG} in this script."
  echo "  Fix A (JetPack 5): recreate venv with Python 3.8 if available:"
  echo "       python3.8 -m venv .venv && source .venv/bin/activate && bash scripts/install_jetson_backend.sh"
  echo "  Fix B: Pick a matching *.whl from https://developer.download.nvidia.com/compute/redist/jp/"
  echo "       then run:  export NV_TORCH_URL='...' && bash scripts/install_jetson_backend.sh"
  exit 1
fi

TORCHVISION_SPEC="${TORCHVISION_SPEC:-torchvision==0.15.2}"

stamp() { echo "[$(date +%H:%M:%S)] $*"; }

stamp "NVIDIA PyTorch wheel next — download is large; terminal may look idle for many minutes"
stamp "Upgrading pip / setuptools / wheel..."
python -m pip install -U pip setuptools wheel

stamp "Downloading + installing torch from NVIDIA (not PyPI). Wait..."
python -m pip install --no-cache-dir "${NV_TORCH_URL}"

stamp "Installing torchvision (${TORCHVISION_SPEC}) — --no-deps keeps NVIDIA torch"
python -m pip install "${TORCHVISION_SPEC}" --no-deps

ARCH="$(uname -m)"
stamp "Installing requirements.jetson.txt (includes git clone of segment-anything — can be slow)..."
if [[ "${ARCH}" == aarch64 ]] && [[ "${PY_TAG}" == cp38 ]]; then
  # Polars >=0.20 wheels are manylinux_2_24_aarch64; JP5 pip stacks often reject those tags, so
  # only polars<=0.19.x (manylinux2014_aarch64) appears as compatible under --only-binary.
  # Ultralytics declares polars>=0.20 but runs on 0.19.x for inference paths we use; install it --no-deps.
  stamp "aarch64 + Python 3.8: polars==0.19.12 (manylinux2014) + ultralytics --no-deps + runtime libs"
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
  stamp "Polars manylinux_2_24 wheel + full requirements (constraints file optional)"
  python -m pip install --only-binary=:all: "polars>=1.8.2,<3" \
    || python -m pip install --only-binary=:all: "polars==1.8.2"
  python -m pip install -r requirements.jetson.txt -c constraints-jetson.txt
fi

python -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.version.cuda)"

echo "==> Done. Start API (example):"
echo "    ULTRALYTICS_SKIP_REQUIREMENTS_CHECKS=1 PYTHONNOUSERSITE=1 python nauticai_api.py"
echo "    Optional: cp .env.jetson.example .env  # Jetson-tuned NAUTICAI_* defaults + comments"
echo "    If you only need to fix missing fpdf/fastapi (torch already OK): bash scripts/jetson_reinstall_python_deps.sh"
