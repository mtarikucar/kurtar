# 1. PostGIS from day one

## Status

Accepted (Task 2, backend schema).

## Context

Discovery — "surprise bags near me" — is the product's core loop. That means, from the very first schema, kurtar needs a real spatial query: given a consumer's lat/lng, find published offers at stores within a radius, ordered by distance. There are two ways to get there:

1. Store plain `latitude`/`longitude` floats and do the distance math in the application layer (a bounding-box pre-filter plus haversine in SQL or JS).
2. Use PostgreSQL's PostGIS extension: a real `geography(Point,4326)` column, a GIST spatial index, and `ST_DWithin`/`ST_Distance` doing the actual work in the database.

## Decision

PostGIS, from the very first migration (`prisma/migrations/20260812171242_init`), not bolted on later.

`Store.location` is `Unsupported("geography(Point,4326)")` in `schema.prisma` — Prisma's schema DSL cannot express a GIST index or a geography column natively, so the column and its index are hand-written SQL inside the init migration (see that migration's own comments), and every write that touches `latitude`/`longitude` also sets `location` via `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` in the same transaction (`stores.service.ts`). `latitude`/`longitude` stay the source of truth for display; `location` exists purely as discovery's spatial index column.

This is the one deliberate, permanent, and expected divergence the `migrations-parity` CI job allows through its diff check (a hand-written GIST index Prisma's schema has no way to declare) — everything else in that job's diff must be empty.

## Consequences

- **Real distance queries from day one.** `discovery.service.ts`'s radius search is a genuine `ST_DWithin` query with a GIST index behind it, not an application-layer approximation that would need a rewrite once the offer count made naive filtering too slow.
- **Retrofitting PostGIS later would have meant a real migration on live data** — backfilling `location` for every existing store, plus a cutover window. Doing it in the very first migration means there was never a "before PostGIS" schema to migrate away from.
- **One Prisma-DSL escape hatch to maintain.** Every future migration that touches `stores` must remember `location` is hand-written SQL, not something `prisma migrate dev` can regenerate from `schema.prisma` alone — the `migrations-parity` CI job's allowlisted single diff line is the tripwire that catches a future migration silently dropping or duplicating it.
- **The dev/CI/prod Postgres image must always be `postgis/postgis`, never plain `postgres`** — every compose file and CI service container in this repo already reflects that; it's a hard, permanent dependency, not a toggle.
