# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
# openssl is required by Prisma's query engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# prisma schema must exist before install — the postinstall script runs `prisma generate`.
COPY prisma ./prisma
# puppeteer is a dev/test-only dep, unused at runtime — skip the Chromium download.
ENV PUPPETEER_SKIP_DOWNLOAD=1
# npm install (not ci) tolerates minor lock drift so the image builds reliably.
RUN npm install --no-audit --no-fund
COPY . .
# db.ts / auth.ts throw at import if these are unset; build never connects, so dummies are fine.
ENV DATABASE_URL="file:/tmp/build.db"
ENV JWT_SECRET="build-time-placeholder-not-used-at-runtime"
RUN npx prisma generate && npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app ./
RUN mkdir -p /app/data
EXPOSE 3000
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
