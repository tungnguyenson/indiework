# IndieWork — production image. Debian-slim (reliable native modules: pg, sharp).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` collects page data by evaluating server modules, including
# src/server/env.ts which validates all four env vars at import time. The build
# stage has no real env, so provide schema-satisfying PLACEHOLDERS (valid URL,
# 32+ char cookie secret, non-empty). These exist only in this stage — they are
# NOT copied into the runtime stage and are not baked into the output (env.ts is
# server-only and re-reads process.env at runtime). Real values are injected at
# runtime via the compose env_file. No DB connection happens here: the pg pool
# is lazy and every route is force-dynamic.
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build" \
    ADMIN_EMAIL="build@example.com" \
    ADMIN_PASSWORD="build-placeholder" \
    COOKIE_SECRET="build-placeholder-cookie-secret-at-least-32-chars" \
    API_TOKEN="build-placeholder" \
    NODE_ENV="production"
RUN pnpm build

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY drizzle ./drizzle
COPY src ./src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc next.config.ts tsconfig.json drizzle.config.ts ./

EXPOSE 3000
# Migrate + ensure a default workspace (both idempotent), then serve.
CMD ["sh", "-c", "node --import tsx src/server/db/migrate.ts && node --import tsx src/server/db/seed.ts && pnpm start --port 3000 --hostname 0.0.0.0"]
