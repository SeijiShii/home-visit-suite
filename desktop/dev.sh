#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# GOPATH/bin を PATH に追加
export PATH="${GOPATH:-$HOME/go}/bin:$PATH"

# 依存チェック
missing=()
command -v go   >/dev/null 2>&1 || missing+=(go)
command -v node >/dev/null 2>&1 || missing+=(node)
command -v npm  >/dev/null 2>&1 || missing+=(npm)

if [ ${#missing[@]} -gt 0 ]; then
  echo "ERROR: missing commands: ${missing[*]}" >&2
  exit 1
fi

# Wails CLI
if ! command -v wails >/dev/null 2>&1; then
  echo "Installing Wails CLI..."
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
fi

# libwebkit2gtk (Ubuntu/Debian)
if command -v dpkg >/dev/null 2>&1; then
  if ! dpkg -s libwebkit2gtk-4.1-dev >/dev/null 2>&1; then
    echo "Installing libwebkit2gtk-4.1-dev..."
    sudo apt-get install -y libwebkit2gtk-4.1-dev
  fi
fi

# npm install (node_modules が無い or package.json が更新された場合)
if [ ! -d frontend/node_modules ] || [ frontend/package.json -nt frontend/node_modules ]; then
  echo "Running npm install..."
  (cd frontend && npm install)
fi

echo "Starting wails dev..."
wails dev
