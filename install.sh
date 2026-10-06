#!/usr/bin/env bash
# FormCraft installer — interactive Docker setup.
#
#   One-liner:  curl -fsSL https://raw.githubusercontent.com/shatheitguy/formcraft/main/install.sh | bash
#   From repo:  ./install.sh            (add --yes to accept all defaults, --dry-run to only write .env)
#
# Asks which database to use (bundled PostgreSQL, your own PostgreSQL, or embedded SQLite),
# the ports to use, and whether to load demo data. Writes everything to .env and starts
# the stack with Docker Compose.
set -euo pipefail

RAW_URL="${FORMCRAFT_RAW:-https://raw.githubusercontent.com/shatheitguy/formcraft/main}"
IMAGE="ghcr.io/shatheitguy/formcraft"
INSTALL_DIR="${FORMCRAFT_DIR:-formcraft}"
ASSUME_YES=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
  esac
done

# ---------- output helpers ----------
if [ -t 1 ]; then B=$'\e[1m'; D=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'; else B= D= G= Y= R= C= N=; fi
info() { printf '%s▸%s %s\n' "$C" "$N" "$*"; }
ok()   { printf '%s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '%s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

# Prompts must work under `curl | bash`, where stdin is the script itself.
if [ -t 0 ]; then TTY=/dev/stdin; elif (exec < /dev/tty) 2>/dev/null; then TTY=/dev/tty; else TTY=/dev/stdin; fi

ask() { # ask VAR "Question" "default"
  local __var=$1 __q=$2 __def=${3:-} __ans
  if [ "$ASSUME_YES" = 1 ]; then printf -v "$__var" '%s' "$__def"; return; fi
  { printf '%s%s%s%s: ' "$B" "$__q" "$N" "${__def:+ ${D}[$__def]${N}}" > /dev/tty; } 2>/dev/null || printf '%s [%s]: ' "$__q" "$__def"
  IFS= read -r __ans < "$TTY" || __ans=
  printf -v "$__var" '%s' "${__ans:-$__def}"
}
ask_secret() { # ask_secret VAR "Question"   (empty allowed)
  local __var=$1 __q=$2 __ans
  if [ "$ASSUME_YES" = 1 ]; then printf -v "$__var" '%s' ''; return; fi
  { printf '%s%s%s: ' "$B" "$__q" "$N" > /dev/tty; } 2>/dev/null || printf '%s: ' "$__q"
  if [ "$TTY" = /dev/tty ] || [ -t 0 ]; then IFS= read -rs __ans < "$TTY" || __ans=; { echo > /dev/tty; } 2>/dev/null || echo; else IFS= read -r __ans < "$TTY" || __ans=; fi
  printf -v "$__var" '%s' "$__ans"
}
yesno() { # yesno "Question" y|n  → returns 0 for yes
  local __a; ask __a "$1 (y/n)" "$2"
  case "$__a" in [Yy]*) return 0 ;; *) return 1 ;; esac
}
choose() { # choose VAR "Question" default "opt1" "opt2" ...
  local __var=$1 __q=$2 __def=$3; shift 3
  local i=1 __a
  printf '\n%s%s%s\n' "$B" "$__q" "$N"
  for o in "$@"; do printf '  %s%d)%s %s\n' "$C" "$i" "$N" "$o"; i=$((i + 1)); done
  while :; do
    ask __a "Choose 1-$#" "$__def"
    if [[ "$__a" =~ ^[0-9]+$ ]] && [ "$__a" -ge 1 ] && [ "$__a" -le $# ]; then printf -v "$__var" '%s' "$__a"; return; fi
    warn "Please enter a number between 1 and $#."
  done
}

# Reads a fixed chunk first: `tr < /dev/urandom | head` would die of SIGPIPE under pipefail.
randpw() { head -c 1024 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c "1-${1:-24}"; }
urlencode() { # percent-encode everything except unreserved characters
  local s=$1 out= c i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in [a-zA-Z0-9.~_-]) out+=$c ;; *) out+=$(printf '%%%02X' "'$c") ;; esac
  done
  printf '%s' "$out"
}
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }

printf '\n%s  ███████╗ FormCraft installer%s\n%s  The self-hosted form builder · Docker setup%s\n\n' "$B" "$N" "$D" "$N"

# ---------- prerequisites ----------
if [ "$DRY_RUN" = 0 ]; then
  command -v docker > /dev/null || die "Docker is not installed. Get it from https://docs.docker.com/get-docker/ and re-run."
  docker compose version > /dev/null 2>&1 || die "Docker Compose v2 is required ('docker compose'). Update Docker and re-run."
  docker info > /dev/null 2>&1 || die "Docker is installed but not running (or you need sudo / the docker group)."
  ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '') with Compose $(docker compose version --short 2>/dev/null || echo '')"
fi

# ---------- get the source ----------
if [ -f docker-compose.yml ] && [ -f Dockerfile ] && grep -q formcraft docker-compose.yml 2>/dev/null; then
  ok "Using FormCraft in $(pwd)"
elif [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
  cd "$INSTALL_DIR" && ok "Using existing $(pwd)"
else
  # Only the compose files are needed: the app itself comes from the published image.
  command -v curl > /dev/null || die "curl is required to download FormCraft."
  info "Downloading FormCraft into ./$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR" && cd "$INSTALL_DIR"
  for f in docker-compose.yml docker-compose.db.yml docker-compose.ports.yml; do
    curl -fsSL "$RAW_URL/$f" -o "$f" || die "Could not download $f from $RAW_URL."
  done
  ok "Downloaded the compose files to $(pwd)"
fi

if [ -f .env ] && grep -q '^FC_DB_PROVIDER=' .env && [ "$ASSUME_YES" = 0 ]; then
  warn "An existing configuration was found in .env."
  if ! yesno "Reconfigure it? (No just rebuilds and restarts with the current settings)" n; then
    [ "$DRY_RUN" = 1 ] && exit 0
    info "Updating and starting FormCraft with the existing configuration…"
    docker compose pull && docker compose up -d
    ok "Done."
    exit 0
  fi
fi

# ---------- database ----------
choose DB_CHOICE "Which database should FormCraft use?" 1 \
  "Install a PostgreSQL database for me ${D}(separate container — recommended)${N}" \
  "Use my own PostgreSQL server ${D}(enter host and credentials)${N}" \
  "Embedded SQLite ${D}(single container, simplest — fine for small teams)${N}"

PG_USER= PG_PASS= PG_DB= FC_DATABASE_URL= FC_DB_PROVIDER= ADMINER=0
case "$DB_CHOICE" in
  1)
    FC_DB_PROVIDER=postgresql
    printf '\n%sNew PostgreSQL database%s %s(runs in the formcraft-db container, data in the formcraft-db volume)%s\n' "$B" "$N" "$D" "$N"
    ask PG_DB "Database name" "formcraft"
    ask PG_USER "Database user" "formcraft"
    while :; do
      ask_secret PG_PASS "Database password (leave empty to generate a strong one)"
      if [ -z "$PG_PASS" ]; then PG_PASS=$(randpw 28); ok "Generated a 28-character password (saved in .env)"; break; fi
      if [[ "$PG_PASS" =~ [[:space:]\'\"\$\`\\] ]] || [ ${#PG_PASS} -lt 8 ]; then warn "Use at least 8 characters, without spaces, quotes, \$, \` or backslashes."; continue; fi
      break
    done
    [[ "$PG_DB$PG_USER" =~ ^[A-Za-z0-9_]+$ ]] || die "Database name and user may only contain letters, numbers and underscores."
    FC_DATABASE_URL="postgresql://$(urlencode "$PG_USER"):$(urlencode "$PG_PASS")@db:5432/$(urlencode "$PG_DB")?schema=public"
    yesno "Also install Adminer (a web UI to browse the database)?" n && ADMINER=1
    ;;
  2)
    FC_DB_PROVIDER=postgresql
    printf '\n%sYour PostgreSQL server%s\n' "$B" "$N"
    printf '%s  The database must already exist, and the user needs permission to create tables in it.\n' "$D"
    printf '  If PostgreSQL runs on this same machine, use host %shost.docker.internal%s%s (not localhost).%s\n' "$N$B" "$N" "$D" "$N"
    while :; do
      ask X_HOST "Host" "host.docker.internal"
      ask X_PORT "Port" "5432"
      valid_port "$X_PORT" || { warn "Invalid port."; continue; }
      ask X_DB "Database name" "formcraft"
      ask X_USER "User" "formcraft"
      ask_secret X_PASS "Password"
      ask X_SSL "SSL mode (disable / require)" "disable"
      FC_DATABASE_URL="postgresql://$(urlencode "$X_USER"):$(urlencode "$X_PASS")@${X_HOST}:${X_PORT}/$(urlencode "$X_DB")?schema=public"
      [ "$X_SSL" = require ] && FC_DATABASE_URL="${FC_DATABASE_URL}&sslmode=require"

      if [ "$DRY_RUN" = 1 ]; then warn "Dry run — skipping connection test."; break; fi
      info "Testing the connection…"
      if docker run --rm --add-host=host.docker.internal:host-gateway -e PGPASSWORD="$X_PASS" -e PGSSLMODE="$X_SSL" postgres:16-alpine \
           psql -h "$X_HOST" -p "$X_PORT" -U "$X_USER" -d "$X_DB" -tAc 'select 1' > /tmp/fc-pgtest.log 2>&1; then
        ok "Connected to $X_HOST:$X_PORT/$X_DB as $X_USER"
        break
      fi
      warn "Connection failed: $(tail -n 2 /tmp/fc-pgtest.log | tr '\n' ' ')"
      choose RETRY "What now?" 1 "Re-enter the connection details" "Continue anyway" "Abort"
      [ "$RETRY" = 2 ] && break
      [ "$RETRY" = 3 ] && die "Installation aborted."
    done
    ;;
  3)
    FC_DB_PROVIDER=sqlite
    FC_DATABASE_URL="file:/app/data/formcraft.db"
    ok "SQLite file will be stored in the formcraft-data volume"
    ;;
esac

# ---------- ports & options ----------
printf '\n%sNetwork%s\n' "$B" "$N"
while :; do ask FC_PORT "Port for the FormCraft dashboard" "3000"; valid_port "$FC_PORT" && break; warn "Invalid port."; done

FC_FORM_PORTS=
if yesno "Give every form its own dedicated port (for Cloudflare Tunnel / reverse proxies)?" y; then
  while :; do
    ask FC_FORM_PORTS "Port range for forms" "4001-4050"
    if [[ "$FC_FORM_PORTS" =~ ^([0-9]+)-([0-9]+)$ ]] && [ "${BASH_REMATCH[1]}" -ge 1024 ] && [ "${BASH_REMATCH[2]}" -le 65535 ] && [ "${BASH_REMATCH[2]}" -ge "${BASH_REMATCH[1]}" ]; then
      [ "$FC_PORT" -ge "${BASH_REMATCH[1]}" ] && [ "$FC_PORT" -le "${BASH_REMATCH[2]}" ] && { warn "The range must not include the dashboard port $FC_PORT."; continue; }
      break
    fi
    warn "Use the form START-END, e.g. 4001-4050 (ports 1024–65535)."
  done
fi

FC_SEED_DEMO=false
yesno "Load the 4 demo forms with sample responses?" y && FC_SEED_DEMO=true

# ---------- summary ----------
COMPOSE_FILES="docker-compose.yml"
[ "$DB_CHOICE" = 1 ] && COMPOSE_FILES="$COMPOSE_FILES:docker-compose.db.yml"
[ -n "$FC_FORM_PORTS" ] && COMPOSE_FILES="$COMPOSE_FILES:docker-compose.ports.yml"
DB_LABEL=$([ "$DB_CHOICE" = 1 ] && echo "Bundled PostgreSQL ($PG_USER@db/$PG_DB)" || { [ "$DB_CHOICE" = 2 ] && echo "Your PostgreSQL ($X_USER@$X_HOST:$X_PORT/$X_DB)" || echo "Embedded SQLite"; })

printf '\n%sSummary%s\n' "$B" "$N"
printf '  Database    %s\n' "$DB_LABEL"
printf '  Dashboard   http://localhost:%s\n' "$FC_PORT"
printf '  Form ports  %s\n' "${FC_FORM_PORTS:-disabled}"
printf '  Demo data   %s\n' "$FC_SEED_DEMO"
[ "$ADMINER" = 1 ] && printf '  Adminer     http://localhost:8080\n'
echo
yesno "Write this configuration and start FormCraft?" y || die "Installation aborted — nothing was changed."

# ---------- write .env ----------
# Keep unrelated lines (e.g. local development settings); replace the installer's keys.
TMP=$(mktemp)
if [ -f .env ]; then
  cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
  grep -vE '^(# FormCraft installer|FC_|POSTGRES_|COMPOSE_FILE=|COMPOSE_PATH_SEPARATOR=|COMPOSE_PROFILES=)' .env > "$TMP" || true
fi
{
  cat "$TMP"
  echo "# FormCraft installer — $(date -u +%Y-%m-%dT%H:%M:%SZ). Re-run ./install.sh to change."
  echo "COMPOSE_FILE=$COMPOSE_FILES"
  echo "COMPOSE_PATH_SEPARATOR=:"
  [ "$ADMINER" = 1 ] && echo "COMPOSE_PROFILES=tools"
  echo "FC_DB_PROVIDER=$FC_DB_PROVIDER"
  # Published image variant for this database engine (pin a release with e.g. 1.0.0 / 1.0.0-postgres).
  echo "FC_IMAGE_TAG=$([ "$FC_DB_PROVIDER" = postgresql ] && echo postgres || echo latest)"
  echo "FC_DATABASE_URL='$FC_DATABASE_URL'"
  echo "FC_PORT=$FC_PORT"
  echo "FC_FORM_PORTS=$FC_FORM_PORTS"
  echo "FC_SEED_DEMO=$FC_SEED_DEMO"
  if [ "$DB_CHOICE" = 1 ]; then
    echo "POSTGRES_DB=$PG_DB"
    echo "POSTGRES_USER=$PG_USER"
    echo "POSTGRES_PASSWORD='$PG_PASS'"
  fi
} > .env
rm -f "$TMP"
chmod 600 .env 2>/dev/null || true
ok "Saved configuration to $(pwd)/.env (readable only by you)"

if [ "$DRY_RUN" = 1 ]; then warn "Dry run — not starting Docker."; exit 0; fi

# ---------- start ----------
info "Pulling $IMAGE and starting FormCraft…"
docker compose pull
docker compose up -d

info "Waiting for FormCraft to become healthy…"
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$FC_PORT/api/health" > /dev/null 2>&1; then
    printf '\n%s%s✓ FormCraft is running!%s\n\n' "$G" "$B" "$N"
    printf '  Open %shttp://localhost:%s%s and create your admin account.\n' "$B" "$FC_PORT" "$N"
    printf '  Settings and database credentials are in %s/.env\n' "$(pwd)"
    printf '  Logs: docker compose logs -f   ·   Stop: docker compose down   ·   Reconfigure: ./install.sh\n\n'
    exit 0
  fi
  sleep 2
done
warn "FormCraft didn't report healthy within 3 minutes. Check the logs with: docker compose logs -f formcraft"
exit 1
