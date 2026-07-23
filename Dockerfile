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
# db.ts / auth.ts throw at import if these are unset; build never connects, so
# dummies are fine -- but jwt.ts explicitly rejects any value containing the
# word "placeholder" (a real security guard). The schema is PostgreSQL, so the
# build-time DATABASE_URL must use a PostgreSQL protocol even though it is not
# connected during the image build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV JWT_SECRET="0000dummy0000buildtimeonly0000notusedatruntime0000000000000000"
RUN npx prisma generate && npm run build

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3084
COPY --from=build /app ./
RUN mkdir -p /app/data
EXPOSE 3084
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
