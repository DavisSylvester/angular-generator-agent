#!/usr/bin/env bash
set -euo pipefail

# angular-generator-agent — Foreground launcher
# Usage: ./run.sh <prd-file> [options]

if [ $# -lt 1 ]; then
  echo "Usage: ./run.sh <prd-file> [options]"
  echo "       ./run.sh --help"
  exit 1
fi

exec bun run src/index.mts "$@"
