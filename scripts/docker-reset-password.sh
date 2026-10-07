#!/bin/sh
# Installed in the image as `reset-password`:
#   docker exec -it formcraft reset-password <username-or-email> <new-password> [--disable-2fa]
# docker exec runs as root; drop to the app user (as the entrypoint does) so a SQLite
# database never ends up with journal files the app can't write.
cd /app
if [ "$(id -u)" = "0" ]; then
  exec su-exec "${PUID:-1001}:${PGID:-1001}" node scripts/reset-password.js "$@"
fi
exec node scripts/reset-password.js "$@"
