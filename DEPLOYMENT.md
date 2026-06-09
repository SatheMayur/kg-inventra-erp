# Inventra — Production Deployment Guide

The application **builds clean** (`npm run build` passes) and all known critical/high bugs are fixed. Before going live you must move off the SQLite dev setup and set real secrets. Follow these steps in order.

> ⚠️ Do **not** ship the development database or demo data. `prisma/seed-demo.ts` is for local demos only — never run it in production.

## 1. Provision PostgreSQL
- Create a managed Postgres database (Neon, Supabase, RDS, etc.).
- **Rotate any previously-exposed credential** (the Neon dev string leaked in shell env earlier — reset it).

## 2. Point Prisma at Postgres
In `prisma/schema.prisma`, change the datasource:
```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```
(Kept on SQLite in the repo so local dev keeps working — flip it in your deploy branch/build.)

## 3. Environment variables
Copy `.env.production.example` to your host env and fill every value:
- `DATABASE_URL` — the Postgres connection string.
- `JWT_SECRET` — generate fresh: `openssl rand -hex 32`. **Never reuse the dev secret.**
- `NODE_ENV=production`.
- Remove any global/shell `DATABASE_URL` on the build machine so it can't override the prod value.

## 4. Create the schema in Postgres
```bash
npx prisma migrate deploy        # if you maintain migrations
# or, to push the schema directly:
npx prisma db push
npx prisma generate
```

## 5. Seed ONE real admin (no weak defaults)
The dev seed (`prisma/seed.ts`) creates users with the password `pass123` — **unacceptable in production**.
- Edit `prisma/seed.ts` to a single real admin with a strong password, **or** create the admin manually, then run:
```bash
npx prisma db seed
```
- Do **NOT** run `prisma/seed-demo.ts`.
- After first login, create remaining users via the app and rotate the admin password.

## 6. Build and run
```bash
npm ci
npm run build      # prisma generate && next build — verified passing
npm start          # serves on PORT (default 3000)
```
Serve behind an HTTPS reverse proxy (nginx/Caddy/managed platform).

## 7. Operational hardening
- **Backups**: schedule automated Postgres backups.
- **Secrets**: keep `.env` out of git (already gitignored). Use the host's secret manager.
- **Login rate limit**: behind a proxy, ensure the real client IP reaches the app (set `trust proxy` / forward `X-Forwarded-For`) so the per-IP login limiter isn't bypassed or globally tripped.
- **Monitoring**: watch the `/api/health` endpoint.

## Status at hand-off
- ✅ Code: bug-fixed, Subsystem A (dept-head approval + ready-for-pickup) shipped, note suggestions shipped — all committed.
- ✅ `npm run build` passes.
- ⏸️ Subsystem B (auto-PO + budget approval) — designed (`docs/superpowers/specs/`), planned (`docs/superpowers/plans/`), **not built**. Resume from the spec.
- ⛔ Pending (yours): Postgres switch, prod secrets, clean DB + strong admin password, credential rotation, backups.
