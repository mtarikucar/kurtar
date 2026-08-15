#!/usr/bin/env bash
# dev-up.sh — the ONE command that brings up local kurtar dev from a
# clean clone: infra (PostGIS+Redis), dependency install, Prisma client
# generation, migrations, demo data, then backend + the three web
# surfaces (merchant-web, admin-web, landing) — all logs interleaved
# here, Ctrl+C stops every one of them.
#
# The Expo consumer app is deliberately NOT started here (it has no
# meaningful "just serve it" mode outside its own device/simulator
# tooling) — run `npm run web -w consumer` yourself once this is up; see
# README.md.
#
# Usage:
#   ./scripts/dev-up.sh              # infra + migrate + seed + start everything
#   ./scripts/dev-up.sh --no-seed    # skip (re-)seeding demo data
#   ./scripts/dev-up.sh --down       # stop the infra containers and exit (no app servers)
#
# Idempotent: safe to run again on an already-running stack (docker
# compose up -d is a no-op on running containers; migrate deploy only
# applies pending migrations; the demo seed tears itself down and
# recreates itself — see backend/prisma/seed-demo.ts).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log()  { printf '\033[0;34m[dev-up]\033[0m %s\n' "$*"; }
ok()   { printf '\033[0;32m[dev-up]\033[0m %s\n' "$*"; }
err()  { printf '\033[0;31m[dev-up]\033[0m %s\n' "$*" >&2; }

SEED=1
DOWN_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED=0 ;;
    --down) DOWN_ONLY=1 ;;
    *)
      err "Unknown argument: $arg (expected --no-seed and/or --down)"
      exit 1
      ;;
  esac
done

if [ "$DOWN_ONLY" -eq 1 ]; then
  log "Stopping infra containers (ops/docker-compose.yml)..."
  docker compose -f ops/docker-compose.yml down
  ok "Infra stopped. Demo data (if any) stays in the volume; run this script again to resume."
  exit 0
fi

# ---------------------------------------------------------------------
# 1. Env files — never overwrite an existing one, always ensure one exists.
# ---------------------------------------------------------------------
ensure_env() {
  local target="$1" example="$2"
  if [ ! -f "$target" ]; then
    if [ ! -f "$example" ]; then
      err "$example is missing — cannot bootstrap $target"
      exit 1
    fi
    cp "$example" "$target"
    log "Created $target from $example (mock providers, dev-only secrets — fine for local dev, never for production)."
  fi
}
ensure_env "$ROOT_DIR/.env" "$ROOT_DIR/.env.example"
ensure_env "$ROOT_DIR/landing/.env.local" "$ROOT_DIR/landing/.env.example"
# merchant-web/admin-web both fall back to http://localhost:4750 in code
# when VITE_API_BASE_URL is unset (see each app's src/api/client.ts), so
# no .env.local is required for either — only created if the app's own
# .env.example ever stops being optional.

# The backend app itself resolves the root .env on its own at boot
# (backend/src/config/env-file.ts's resolveEnvFilePath, fixed after an
# earlier task shipped with ConfigModule silently missing it under `npm
# -w`) — but the bare `prisma` CLI has no such logic and only ever reads
# a `.env` next to prisma/schema.prisma or in its OWN cwd, neither of
# which exists here (the real one lives at the repo root). Sourcing it
# into THIS script's process env is what makes `prisma generate`/`migrate
# deploy`/the seed script below (a plain PrismaClient, not a Nest app —
# same gap) all resolve DATABASE_URL correctly, without duplicating it
# into a second .env file.
set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env"
set +a

# ---------------------------------------------------------------------
# 2. Infra — PostGIS + Redis. --wait blocks until both healthchecks pass
# (Compose v2.1.1+; this repo's dev compose already declares both).
# ---------------------------------------------------------------------
log "Starting infra (PostGIS + Redis)..."
docker compose -f ops/docker-compose.yml up -d --wait
ok "Infra healthy."

# ---------------------------------------------------------------------
# 3. Dependencies — only if node_modules is missing (a clean clone).
# ---------------------------------------------------------------------
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  log "Installing dependencies (npm ci)..."
  npm ci
else
  log "node_modules already present — skipping install (run 'npm ci' yourself after pulling a lockfile change)."
fi

# ---------------------------------------------------------------------
# 4. Prisma client + migrations — MUST run before the backend boots, and
# is never optional: this is exactly the step whose absence turned the
# merged tree's test suite red (see docs/operations.md's migration-doctor
# section for the same rule in prod/staging).
# ---------------------------------------------------------------------
log "Generating Prisma client..."
(cd backend && npx prisma generate)

log "Applying migrations (prisma migrate deploy)..."
(cd backend && npx prisma migrate deploy)
ok "Migrations applied."

# ---------------------------------------------------------------------
# 5. Demo data — reversible + idempotent (backend/prisma/seed-demo.ts
# tears down its own previous rows before recreating them).
# ---------------------------------------------------------------------
if [ "$SEED" -eq 1 ]; then
  log "Seeding demo data..."
  (cd backend && npm run seed:demo)
  ok "Demo data seeded — see README.md for demo credentials."
else
  log "Skipping demo seed (--no-seed)."
fi

# ---------------------------------------------------------------------
# 6. Backend + the three web surfaces, concurrently, prefixed logs.
#
# `set -m` (job control) is what makes cleanup() actually work: `npm run
# dev` doesn't exec into vite/next/nest, it FORKS them as children (and
# npm is not consistent about forwarding signals to those children on
# every platform/version) — killing just npm's own PID routinely leaves
# the real port-holder running behind it. Under job control every
# backgrounded job gets its OWN process group whose id equals that job's
# leader PID, so `kill -- -$pid` (a negative PID) signals the WHOLE
# group — npm, the shell it spawns, and vite/next/nest itself — in one
# shot, not just the top of the tree.
# ---------------------------------------------------------------------
set -m

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kurtar-dev-up.XXXXXX")"
declare -a PIDS=()
declare -a TAIL_PIDS=()

start() {
  local name="$1" dir="$2"
  shift 2
  (
    cd "$ROOT_DIR/$dir"
    exec "$@"
  ) >"$LOG_DIR/$name.log" 2>&1 &
  PIDS+=("$!")
  ( exec tail -n +1 -f "$LOG_DIR/$name.log" | sed -u "s/^/[$name] /" ) &
  TAIL_PIDS+=("$!")
}

cleanup() {
  log "Stopping dev servers..."
  for pid in "${TAIL_PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  for pid in "${PIDS[@]:-}"; do
    kill -- "-$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true
  done
  sleep 1
  for pid in "${PIDS[@]:-}"; do
    kill -9 -- "-$pid" >/dev/null 2>&1 || true
  done
  wait >/dev/null 2>&1 || true
  rm -rf "$LOG_DIR"
  ok "Stopped. Infra containers are still running — './scripts/dev-up.sh --down' to stop those too."
}
trap cleanup EXIT INT TERM

start "backend"      "backend"           npm run dev
start "merchant-web" "apps/merchant-web" npm run dev
start "admin-web"    "apps/admin-web"    npm run dev
start "landing"      "landing"           npm run dev

cat <<'EOF'

kurtar dev stack starting — Ctrl+C stops every server below.
  backend        http://localhost:4750/api  (health: /api/health)
  merchant-web   http://localhost:5173
  admin-web      http://localhost:5174
  landing        http://localhost:3000
  (consumer app: run `npm run web -w consumer` yourself — see README.md)

Demo credentials are documented in README.md.

EOF

wait
