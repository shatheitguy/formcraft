# syntax=docker/dockerfile:1

# ---------- base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- deps ----------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# ---------- build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# One image for both databases: the Prisma provider is compiled into the client, so generate
# a client for each (the query engine is shared) and let the entrypoint pick by DATABASE_URL.
RUN npx prisma generate && npx next build \
 && mkdir -p prisma-clients \
 && cp -r node_modules/.prisma/client prisma-clients/sqlite \
 && sed 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma > prisma/schema.postgresql.prisma \
 && npx prisma generate --schema prisma/schema.postgresql.prisma \
 && cp -r node_modules/.prisma/client prisma-clients/postgresql

# ---------- runtime ----------
FROM base AS runner
LABEL org.opencontainers.image.source="https://github.com/shatheitguy/formcraft" \
      org.opencontainers.image.title="FormCraft" \
      org.opencontainers.image.description="Self-hosted form builder: drag-and-drop forms, submissions, roles, multilingual forms." \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/formcraft.db \
    UPLOAD_DIR=/app/data/uploads \
    FORM_PORT_RANGE=4001-4050 \
    SEED_DEMO_DATA=true

# su-exec: the entrypoint starts as root only to fix ownership of the data folder
# (bind mounts such as Unraid's appdata), then drops to the unprivileged app user.
RUN apk add --no-cache su-exec \
 && addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /app/data && chown nextjs:nodejs /app/data

# Next.js standalone server + static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma clients (SQLite + PostgreSQL), engines and CLI (used to sync the schema on start).
# node_modules/.prisma/client is a symlink the entrypoint points at the matching client.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma-clients ./prisma-clients
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
RUN rm -rf node_modules/.prisma && mkdir node_modules/.prisma \
 && ln -s /app/prisma-clients/sqlite node_modules/.prisma/client \
 && chown -h nextjs:nodejs node_modules/.prisma node_modules/.prisma/client

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000 4001-4050
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
