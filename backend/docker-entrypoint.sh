#!/bin/sh
set -e
echo "[IMS] Running database migrations..."
npx prisma migrate deploy
echo "[IMS] Starting server..."
exec node dist/index.js
