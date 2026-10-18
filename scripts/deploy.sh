#!/usr/bin/env bash
# Copy the app to the VPS and (re)start it.   Usage: scripts/deploy.sh user@host [remote_dir]
# The server's .env is never touched: create it once there from .env.production.example.
set -euo pipefail

TARGET="${1:?usage: scripts/deploy.sh user@host [remote_dir]}"
DIR="${2:-~/vu-study}"
cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude node_modules --exclude .next --exclude 'parser/.venv' --exclude '__pycache__' \
  --exclude '.env' --exclude '.env.local' --exclude '.env.*.local' \
  --exclude 'public/pdf.worker.min.mjs' --exclude '*.log' \
  ./ "$TARGET:$DIR/"

ssh "$TARGET" "cd $DIR && test -f .env || { echo 'Missing $DIR/.env: copy .env.production.example to .env and fill it in.'; exit 1; } \
  && docker compose up -d --build && docker compose ps"
