#!/usr/bin/env bash
# (Re)start VU Study with Docker Compose.
#
#   On the VPS, inside the project folder:   scripts/deploy.sh
#   From your laptop (copies code via rsync): scripts/deploy.sh user@host [remote_dir]
#
# The server's .env is never copied or overwritten: create it once there from .env.production.example.
set -euo pipefail
cd "$(dirname "$0")/.."

start() {
  test -f .env || { echo "Missing .env: run  cp .env.production.example .env && chmod 600 .env  and fill it in."; exit 1; }
  docker compose up -d --build
  docker compose ps
}

if [ $# -eq 0 ]; then
  start
  exit
fi

TARGET="$1"
DIR="${2:-~/vu-study}"

rsync -az --delete \
  --exclude node_modules --exclude .next --exclude 'parser/.venv' --exclude '__pycache__' \
  --exclude '.env' --exclude '.env.local' --exclude '.env.*.local' \
  --exclude 'public/pdf.worker.min.mjs' --exclude '*.log' \
  ./ "$TARGET:$DIR/"

ssh "$TARGET" "cd $DIR && scripts/deploy.sh"
