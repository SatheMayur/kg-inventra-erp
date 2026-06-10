#!/bin/sh
set -e

echo "[inventra] applying schema to $DATABASE_URL"
npx prisma db push --skip-generate

echo "[inventra] seeding base users (idempotent)"
node --experimental-strip-types prisma/seed.ts || echo "[inventra] base seed skipped"

echo "[inventra] seeding demo data (skips if already present)"
node --experimental-strip-types prisma/seed-demo.ts || echo "[inventra] demo seed skipped"

echo "[inventra] starting server on :3000"
exec npm start
