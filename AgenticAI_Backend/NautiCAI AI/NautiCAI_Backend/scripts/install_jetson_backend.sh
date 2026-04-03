#!/usr/bin/env bash
# JetPack 5.1.1 + Python 3.8 (cp38). Adjust NV_TORCH_URL if your JetPack differs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

NV_TORCH_URL="https://developer.download.nvidia.com/compute/redist/jp/v511/pytorch/torch-2.0.0+nv23.05-cp38-cp38-linux_aarch64.whl"

echo "==> NVIDIA PyTorch (must stay on this wheel; do not pip install torch from PyPI)"
pip install --no-cache-dir "${NV_TORCH_URL}"

echo "==> torchvision (matches torch 2.0.x; --no-deps avoids replacing torch)"
pip install "torchvision==0.15.2" --no-deps

echo "==> Core requirements (no torch / no ultralytics in file)"
pip install -r requirements-jetson.txt

echo "==> ultralytics without deps (otherwise pip upgrades torch)"
pip install "ultralytics==8.4.30" --no-deps

echo "==> ultralytics runtime deps (not torch/torchvision)"
pip install matplotlib pyyaml scipy pillow psutil polars ultralytics-thop

python -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available(), torch.version.cuda)"

echo "==> Done. Start API: python nauticai_api.py"
echo "    Optional: cp .env.jetson.example .env  # Jetson-tuned NAUTICAI_* defaults + comments"
echo "    If you only need to fix missing fpdf/fastapi (torch already OK): bash scripts/jetson_reinstall_python_deps.sh"
