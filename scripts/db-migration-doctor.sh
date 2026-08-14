#!/usr/bin/env bash
# db-migration-doctor.sh — conservative Prisma migration state doctor.
# Ported from kds/scripts/db-migration-doctor.sh; adapted for kurtar's
# simpler, compose-only deploy topology (no long-running "pre-swap"
# container to `docker exec` into like kds's blue-green setup has).
#
# Instead of `docker exec <named container>`, every Prisma-CLI probe here
# runs via `docker compose -f <compose_file> run --rm <api_service> npx
# prisma ...` — a one-off container on the same network as db/redis, using
# whatever image is CURRENTLY resolved for <api_service>:
#   - called BEFORE `docker compose pull` (release-deploy.yml's preflight
#     job, with --dry-run) it resolves to the image from the PREVIOUS
#     deploy — i.e. "is the currently-deployed state healthy?"
#   - called AFTER `docker compose pull` (the real deploy job) it resolves
#     to the NEWLY pulled image — i.e. "do THIS release's migrations apply
#     cleanly?" — and, without --dry-run, is allowed to actually run
#     `prisma migrate deploy` / `migrate resolve`.
# One mechanism, two call sites; see release-deploy.yml for both.
#
# Exit codes (same contract as kds's original):
#   0 — deploy may proceed (clean state, pending-only, or a single
#       provably-idempotent failure that was auto-resolved and re-applied
#       — or, under --dry-run, would have been).
#   1 — deploy must ABORT: P3005 baseline missing, drift detected, a
#       failed migration with non-idempotent SQL, or multiple failed
#       migrations. A decision-support report is printed to stderr.
#
# This script NEVER marks migrations as `--applied` automatically. If
# that's genuinely the right call, an operator must make it by hand — see
# the remediation hints this script prints.
#
# Usage:
#   db-migration-doctor.sh <compose_file> <api_service> <postgres_container> \
#                           <db_user> <db_name> [--dry-run]

set -euo pipefail

COMPOSE_FILE="${1:?compose file path required}"
API_SERVICE="${2:?api service name required}"
POSTGRES_CONTAINER="${3:?postgres container name required}"
DB_USER="${4:?db user required}"
DB_NAME="${5:?db name required}"
DRY_RUN=0
if [ "${6:-}" = "--dry-run" ]; then
  DRY_RUN=1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "[doctor] Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

# Coloured logging — keep colours out of stderr so log parsers don't choke.
log()  { printf '\033[0;34m[doctor]\033[0m %s\n' "$*"; }
ok()   { printf '\033[0;32m[doctor]\033[0m %s\n' "$*"; }
err()  { printf '\033[0;31m[doctor]\033[0m %s\n' "$*" >&2; }

indent() {
  # Reads stdin, prints each line prefixed with 3 spaces — used instead of
  # `sed 's/^/   /'` (shellcheck SC2001: prefer shell built-ins over sed
  # for a plain substitution).
  while IFS= read -r line; do
    printf '   %s\n' "$line"
  done
}

compose_run() {
  # --workdir /app/backend: the image's own WORKDIR is /app (see backend/
  # Dockerfile) with prisma/ under /app/backend — the persistent api
  # container's CMD (`node backend/dist/main.js`) depends on staying at
  # /app, so this overrides the working directory for THIS one-off `run`
  # only, without touching the service's own boot config. Every prisma
  # CLI call below (and the relative migrations/<name>/migration.sql
  # paths used further down) assumes this cwd.
  docker compose -f "$COMPOSE_FILE" run --rm -T --workdir /app/backend "$API_SERVICE" "$@"
}

# ----------------------------------------------------------------------
# Probe 1 (always runs): direct psql sanity. `prisma migrate status`
# happily reports "N migrations pending" when there is NO
# `_prisma_migrations` table but the schema is otherwise populated —
# `migrate deploy` then explodes with "The database schema is not
# empty" (P3005). That contradiction is invisible from the prisma CLI;
# we need to ask postgres directly.
# ----------------------------------------------------------------------

pq() {
  # short helper: psql -tAc, trimmed
  docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null \
    | tr -d ' \r\n'
}

if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
  if [ "$DRY_RUN" -eq 1 ]; then
    ok "[dry-run] Postgres container '${POSTGRES_CONTAINER}' is not running yet (first-ever deploy?) — nothing to check."
    exit 0
  fi
  err "Postgres container '${POSTGRES_CONTAINER}' is not running — cannot probe migration state."
  exit 1
fi

# table_type='BASE TABLE' (not just table_schema/name) matters here: the
# postgis/postgis image pre-installs the postgis extension into the target
# database at container init — BEFORE any prisma migration ever runs — which
# creates spatial_ref_sys (a real base table) plus geometry_columns and
# geography_columns (views, but information_schema.tables lists views too
# unless filtered out). Without this filter, a genuinely fresh, never-
# migrated database reports 3 "user tables" and 0 applied migrations,
# tripping a false-positive P3005-hidden detection that would block the
# very first deploy. spatial_ref_sys itself is excluded by name since it's
# a real BASE TABLE that PostGIS owns, not anything Prisma manages.
user_tables=$(pq "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT LIKE '_prisma%' AND table_name != 'spatial_ref_sys'")
user_tables="${user_tables:-0}"
has_mig_table=$(pq "SELECT to_regclass('public._prisma_migrations') IS NOT NULL")
if [ "$has_mig_table" = "t" ]; then
  applied_migs=$(pq "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
  applied_migs="${applied_migs:-0}"
else
  applied_migs=0
fi

if [ "$user_tables" -gt 0 ] && [ "$applied_migs" -eq 0 ]; then
  err "P3005 (hidden): $user_tables user tables exist but 0 migrations are recorded as applied."
  err "The script must NOT auto-resolve this blindly — the DB might be partially migrated."
  err ""
  err "Baseline manually once you've verified the schema is complete:"
  err "  docker compose -f $COMPOSE_FILE run --rm $API_SERVICE sh -c 'cd backend && for m in \$(ls prisma/migrations | grep -E \"^[0-9]\" | sort); do npx --no-install prisma migrate resolve --applied \"\$m\"; done'"
  err "Then re-run the deploy."
  exit 1
fi

# ----------------------------------------------------------------------
# Probe 2: prisma migrate status via the api service image (see the
# module header for which image this resolves to at each call site).
# ----------------------------------------------------------------------

log "Querying prisma migrate status (compose run --rm ${API_SERVICE})…"
status_out=$(compose_run npx --no-install prisma migrate status 2>&1 || true)
printf '%s\n' "$status_out" | indent

# P3005 → baseline missing. Prisma surfaces this either as the literal
# error code or as the human-readable "database schema is not empty"
# line, depending on which sub-command tripped it.
if echo "$status_out" | grep -qE 'P3005|database schema is not empty'; then
  err "P3005 detected — database is not empty but no migration history exists."
  err "DO NOT auto-mark migrations as applied. An operator must baseline manually:"
  err "  1. Identify which migrations are already reflected in the DB schema"
  err "  2. docker compose -f $COMPOSE_FILE run --rm --workdir /app/backend $API_SERVICE npx prisma migrate resolve --applied <each one>"
  err "  3. Re-run the deploy"
  exit 1
fi

# Drift = schema in DB does not match the migrations folder.
if echo "$status_out" | grep -qi "drift detected"; then
  err "Schema drift detected — DB has changes not in migration history."
  err "Investigate (prisma migrate diff) and reconcile before deploying."
  exit 1
fi

# Failed migration in DB. Prisma's `migrate status` wording is version-
# dependent, so match every shape seen in the wild rather than one
# pattern (kds hit a real incident from a single-pattern parse missing a
# real failure — see kds's own history for that root cause).
# shellcheck disable=SC2016 # backticks/$ are intentionally literal in these patterns
failed_names=$(printf '%s\n' "$status_out" \
  | grep -oE 'The `[0-9A-Za-z_]+` migration started|migrate resolve --(rolled-back|applied) "[0-9A-Za-z_]+"' \
  | sed -E 's/^The `([^`]+)` migration started$/\1/; s/^migrate resolve --(rolled-back|applied) "([^"]+)"$/\2/' \
  | grep -E '^[0-9]' \
  | sort -u || true)

failed_count=$(printf '%s\n' "$failed_names" | grep -c . || true)

if [ "$failed_count" -gt 1 ]; then
  err "Multiple failed migrations detected:"
  printf '%s\n' "$failed_names" | while IFS= read -r n; do
    printf '   - %s\n' "$n" >&2
  done
  err "Resolve each one manually before retrying."
  exit 1
fi

if [ "$failed_count" -eq 1 ]; then
  name=$(echo "$failed_names" | head -n1)
  migration_sql="prisma/migrations/$name/migration.sql"

  log "Inspecting $name for safe auto-recovery…"

  # ---- Explicit opt-in marker -----------------------------------------
  # A migration that legitimately needs UPDATE/INSERT/DROP statements can
  # declare itself fully idempotent by-construction with a header comment:
  #     -- @doctor:idempotent verified=<one-line rationale>
  marker_out=$(compose_run sh -c "head -10 '$migration_sql' 2>/dev/null | grep -E '^-- @doctor:idempotent'" || true)
  if [ -n "$marker_out" ]; then
    log "Migration carries explicit idempotency marker: ${marker_out#-- }"
    declared_idempotent=1
  else
    declared_idempotent=0
  fi

  # ---- Risk pattern checks --------------------------------------------
  risk_report=$(compose_run sh -c "
    set -eu
    f='$migration_sql'
    out=''
    bare_create_table=\$(grep -nE '^[[:space:]]*CREATE[[:space:]]+TABLE[[:space:]]+\"' \"\$f\" | grep -v 'IF NOT EXISTS' || true)
    if [ -n \"\$bare_create_table\" ]; then
      out=\"\${out}CREATE TABLE without IF NOT EXISTS:\n\$bare_create_table\n\"
    fi
    bare_create_index=\$(grep -nE '^[[:space:]]*CREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX[[:space:]]+\"' \"\$f\" | grep -v 'IF NOT EXISTS' || true)
    if [ -n \"\$bare_create_index\" ]; then
      out=\"\${out}CREATE [UNIQUE] INDEX without IF NOT EXISTS:\n\$bare_create_index\n\"
    fi
    if [ '$declared_idempotent' -eq 0 ]; then
      destructive=\$(grep -nE '^[[:space:]]*(DROP[[:space:]]+(TABLE|COLUMN|INDEX|CONSTRAINT)|TRUNCATE|UPDATE[[:space:]]+|INSERT[[:space:]]+INTO|DELETE[[:space:]]+FROM|ALTER[[:space:]]+TABLE[[:space:]]+\"[^\"]+\"[[:space:]]+DROP|ALTER[[:space:]]+TABLE[[:space:]]+\"[^\"]+\"[[:space:]]+RENAME|ALTER[[:space:]]+TABLE[[:space:]]+\"[^\"]+\"[[:space:]]+ALTER[[:space:]]+COLUMN[[:space:]]+\"[^\"]+\"[[:space:]]+TYPE|ADD[[:space:]]+CONSTRAINT[^,;]*[[:space:]]+CHECK)' \"\$f\" || true)
      if [ -n \"\$destructive\" ]; then
        out=\"\${out}Destructive or data-validating operations:\n\$destructive\n\"
      fi
    fi
    printf '%b' \"\$out\"
  " 2>/dev/null || true)

  if [ -n "$risk_report" ]; then
    err "Failed migration '$name' is NOT safely auto-recoverable."
    err "Risky statements found:"
    printf '%s' "$risk_report" | sed 's/^/   /' >&2
    err ""
    err "Manual recovery:"
    err "  1. SSH to the DB server, open psql, inspect each affected table"
    err "  2. If fully applied  -> docker compose -f $COMPOSE_FILE run --rm --workdir /app/backend $API_SERVICE npx prisma migrate resolve --applied $name"
    err "     If not applied    -> docker compose -f $COMPOSE_FILE run --rm --workdir /app/backend $API_SERVICE npx prisma migrate resolve --rolled-back $name"
    err "     If partial        -> operator must reconcile by hand"
    err "  3. Re-trigger the deploy"
    exit 1
  fi

  log "Migration '$name' SQL appears fully idempotent."
  if [ "$DRY_RUN" -eq 1 ]; then
    ok "[dry-run] Would mark '$name' as rolled-back and re-apply. No action taken."
    exit 0
  fi
  log "Marking as rolled-back and re-applying…"
  compose_run npx --no-install prisma migrate resolve --rolled-back "$name"
  compose_run npx --no-install prisma migrate deploy
  ok "Failed migration '$name' recovered."
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  ok "[dry-run] Migration state clean — deploy may proceed. No action taken."
  exit 0
fi

ok "Migration state clean — deploy may proceed."
exit 0
