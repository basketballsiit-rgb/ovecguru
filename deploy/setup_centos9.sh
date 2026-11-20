#!/usr/bin/env bash
# ==============================================================================
# OVEC GURU - Safe Step-by-Step Setup Script for CentOS Stream 9
# Hardware Constraints:
#   - Xeon X3440 (No AVX/AVX2) | No GPU | ~3.6 GB free RAM
#   - Root (/) only 4.7 GB free | /home has 384 GB free
# All caches, temp files, venv, uploads, logs, and pgdata live in /home/ovec_guru
# ==============================================================================

set -euo pipefail

BASE_DIR="/home/ovec_guru"
BACKEND_DIR="${BASE_DIR}/backend"
FRONTEND_DIR="${BASE_DIR}/frontend"
VENV_DIR="${BACKEND_DIR}/venv"

echo "============================================================"
echo " OVEC GURU - CentOS Stream 9 Safe Production Setup"
echo "============================================================"

# [Step 1] Prepare directory layout strictly under /home/ovec_guru
echo "[1/7] Creating directory layout under ${BASE_DIR}..."
sudo mkdir -p \
  "${BASE_DIR}/uploads" \
  "${BASE_DIR}/pgdata" \
  "${BASE_DIR}/pip_cache" \
  "${BASE_DIR}/npm_cache" \
  "${BASE_DIR}/tmp/nginx_body" \
  "${BASE_DIR}/tmp/nginx_proxy" \
  "${BASE_DIR}/logs"

sudo chown -R "${USER}:${USER}" "${BASE_DIR}"
chmod 755 "${BASE_DIR}"
chmod 775 "${BASE_DIR}/uploads" "${BASE_DIR}/tmp" "${BASE_DIR}/logs"

# [Step 2] Install required OS packages and clean dnf cache immediately to protect /
echo "[2/7] Installing system packages (python3, tesseract + tha, poppler-utils, nginx)..."
sudo dnf install -y epel-release || true
sudo dnf install -y \
  python3 \
  python3-pip \
  tesseract \
  tesseract-langpack-tha \
  poppler-utils \
  nginx
sudo dnf clean all

# [Step 3] Export all cache & temp environment variables into /home/ovec_guru
echo "[3/7] Exporting PIP_CACHE_DIR, TMPDIR, and npm_config_cache under ${BASE_DIR}..."
export PIP_CACHE_DIR="${BASE_DIR}/pip_cache"
export TMPDIR="${BASE_DIR}/tmp"
export TEMP="${BASE_DIR}/tmp"
export TMP="${BASE_DIR}/tmp"
export XDG_CACHE_HOME="${BASE_DIR}/pip_cache"
export npm_config_cache="${BASE_DIR}/npm_cache"

# [Step 4] Check .env configuration
echo "[4/7] Checking ${BASE_DIR}/.env..."
if [ ! -f "${BASE_DIR}/.env" ]; then
  if [ -f "${BASE_DIR}/.env.example" ]; then
    cp "${BASE_DIR}/.env.example" "${BASE_DIR}/.env"
    echo "WARNING: Created ${BASE_DIR}/.env from .env.example."
    echo "Please edit ${BASE_DIR}/.env (DATABASE_URL, AI_API_KEY, JWT_SECRET) before running in production!"
  else
    echo "ERROR: ${BASE_DIR}/.env not found! Please upload project files to ${BASE_DIR} first."
    exit 1
  fi
fi

# [Step 5] Create Python venv and install lightweight zero-AVX backend dependencies
echo "[5/7] Setting up Python virtual environment in ${VENV_DIR}..."
if [ ! -d "${VENV_DIR}" ]; then
  python3 -m venv "${VENV_DIR}"
fi
"${VENV_DIR}/bin/pip" install --upgrade pip
"${VENV_DIR}/bin/pip" install -r "${BACKEND_DIR}/requirements.txt"

# [Step 6] Run database table creation and idempotent initial seed
echo "[6/7] Running backend/seed.py (pgvector + tables + default seed data)..."
cd "${BACKEND_DIR}"
"${VENV_DIR}/bin/python" seed.py

# [Step 7] Build lightweight React Static Frontend (zero Node.js RAM at runtime)
echo "[7/7] Building static frontend bundle in ${FRONTEND_DIR}/dist..."
if command -v npm >/dev/null 2>&1; then
  cd "${FRONTEND_DIR}"
  npm ci --cache "${BASE_DIR}/npm_cache" || npm install --cache "${BASE_DIR}/npm_cache"
  npm run build
else
  echo "WARNING: npm is not installed on this server."
  echo "You can either install Node.js 20 LTS (dnf module enable nodejs:20 && dnf install nodejs)"
  echo "or upload the pre-built frontend/dist folder directly into ${FRONTEND_DIR}/dist."
fi

echo "============================================================"
echo " Setup completed! Disk usage check:"
df -h / /home
echo " Next: install systemd service & nginx config (see README.md)."
echo "============================================================"
