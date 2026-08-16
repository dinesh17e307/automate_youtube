#!/bin/bash
# One-command deploy on a free Linux VM (Oracle Cloud, etc.)
set -euo pipefail

echo "==> Building frontend (same-origin API — no VITE_API_URL needed)..."
npm ci
npm run build -w @kids-youtube/shared
npm run build -w @kids-youtube/frontend

echo "==> Starting production stack..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "Done! Open http://YOUR_VM_IP in a browser."
echo "Health check: http://YOUR_VM_IP/api/health"
