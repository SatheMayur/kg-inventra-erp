#!/bin/sh
set -e

echo "[inventra] applying schema to $DATABASE_URL"
npx prisma db push --skip-generate

echo "[inventra] seeding (admin from ADMIN_EMPID/ADMIN_PASSWORD; dev demo if unset)"
node --experimental-strip-types prisma/seed.ts || echo "[inventra] seed skipped"

if [ "$SEED_DEMO" = "true" ]; then
  echo "[inventra] SEED_DEMO=true -> loading demo data"
  node --experimental-strip-types prisma/seed-demo.ts || echo "[inventra] demo seed skipped"
fi

if [ "${WHATSAPP_BRIDGE_ENABLED:-true}" = "true" ]; then
  echo "[inventra] starting WhatsApp bridge worker"
  WHATSAPP_BRIDGE_APP_URL="${WHATSAPP_BRIDGE_APP_URL:-http://127.0.0.1:3000}" \
    node /app/scripts/whatsapp-bridge.mjs &
else
  echo "[inventra] WhatsApp bridge worker disabled"
fi

echo "[inventra] starting server on :3000"
exec npm start
