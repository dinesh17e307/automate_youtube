#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma db push --skip-generate

echo "Starting background worker + scheduler..."
START_SCHEDULER=true node dist/worker.js &

echo "Starting API server on port ${PORT:-3001}..."
exec node dist/index.js
