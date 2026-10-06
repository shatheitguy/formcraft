# syntax=docker/dockerfile:1

# ---------- base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- deps ----------
FROM base AS deps
ARG DB_PROVIDER=sqlite
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# ---------- build ----------
FROM base AS builder
# sqlite (default) or postgresql — selects the Prisma datasource provider.
ARG DB_PROVIDER=sqlite
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN if [ "$DB_PROVIDER" = "postgresql" ]; then \
      sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma; \
    fi \
 && npx prisma generate && npx next build

# ---------- runtime ----------
FROM base AS runner
ARG DB_PROVIDER=sqlite
LABEL org.opencontainers.image.source="https://github.com/shatheitguy/formcraft" \
      org.opencontainers.image.title="FormCraft" \
      org.opencontainers.image.description="Self-hosted form builder: drag-and-drop forms, submissions, roles, multilingual forms." \
      org.opencontainers.image.licenses="MIT"
# Which Prisma provider this image was built for; the entrypoint checks DATABASE_URL against it.
ENV FC_IMAGE_PROVIDER=${DB_PROVIDER} \
    NODE_ENV=production \
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

# Prisma client, engines and CLI (used to sync the schema on start)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000 4001-4050
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
