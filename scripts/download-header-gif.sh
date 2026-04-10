#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GIF_URL="${1:-https://c.tenor.com/_9xdjWZOmgcAAAAd/tenor.gif}"
TARGET_REL="${2:-frontend/public/branding/header-title.gif}"
TARGET_PATH="${REPO_ROOT}/${TARGET_REL}"

mkdir -p "$(dirname "${TARGET_PATH}")"

curl -L --fail --show-error --silent "${GIF_URL}" --output "${TARGET_PATH}"

echo "Downloaded GIF to: ${TARGET_PATH}"
