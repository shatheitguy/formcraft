#!/bin/sh
set -e

# Started as root: make the data folder writable for the app user, then re-run this script
# unprivileged. PUID/PGID (e.g. 99/100 on Unraid) choose that user; default is the image's 1001.
if [ "$(id -u)" = "0" ]; then
  uid="${PUID:-1001}"; gid="${PGID:-1001}"
  mkdir -p /app/data
  chown -R "$uid:$gid" /app/data /app/.next 2>/dev/null || true
  chown -h "$uid:$gid" /app/node_modules/.prisma /app/node_modules/.prisma/client 2>/dev/null || true
  exec su-exec "$uid:$gid" "$0" "$@"
fi

# Never print the connection string itself — it contains the database password.
case "$DATABASE_URL" in
  postgres*) ENGINE="PostgreSQL" ;;
  file:*)    ENGINE="SQLite ($DATABASE_URL)" ;;
  *)         ENGINE="unknown" ;;
esac

# The image ships a Prisma client per database engine; use the one DATABASE_URL needs.
case "$DATABASE_URL" in
  postgres*) PROVIDER=postgresql; SCHEMA=prisma/schema.postgresql.prisma ;;
  *)         PROVIDER=sqlite;     SCHEMA=prisma/schema.prisma ;;
esac
ln -sfn "/app/prisma-clients/$PROVIDER" /app/node_modules/.prisma/client

# Create/update tables. Retries cover a database that is still starting up.
echo "▸ FormCraft: preparing $ENGINE database"
attempt=1
until node ./node_modules/prisma/build/index.js db push --schema "$SCHEMA" --skip-generate; do
  if [ "$attempt" -ge 30 ]; then
    echo "✗ FormCraft: database not reachable after $attempt attempts — check DATABASE_URL" >&2
    exit 1
  fi
  echo "  database not ready yet (attempt $attempt) — retrying in 2s"
  attempt=$((attempt + 1))
  sleep 2
done

echo "▸ FormCraft: starting on http://localhost:${PORT:-3000}"
exec "$@"
