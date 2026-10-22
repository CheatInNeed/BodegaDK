# 0001 Canonical Database And Migrations

## Status

Accepted.

## Context

BodegaDK uses Supabase for hosted Postgres, auth-linked profile data, browser
realtime helpers, and migration deployment. The Spring backend is still the
authoritative application server for game rules, matchmaking decisions, room
lifecycle, WebSocket handling, and trusted writes.

The project previously had overlapping schema mechanisms:

- Supabase SQL migrations under `supabase/migrations/`
- backend-owned migration files under `apps/server/src/main/resources/db/migration/`

That overlap allowed the same app tables to drift between local, deployed, and
hosted database environments.

## Decision

Supabase Postgres is the canonical database for BodegaDK durable data.

`supabase/migrations/` is the only canonical schema migration path. Do not add
backend-owned migrations or a second migration framework for app-owned tables.

Spring connects to the canonical database at runtime through
`SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and
`SPRING_DATASOURCE_PASSWORD`. These values are secrets and must be provided by
the deploy environment, never committed to the repository.

The deploy stack must fail when those datasource values are missing. It must not
silently fall back to a different Postgres database.

The browser may use the Supabase anon client only for RLS-safe reads and writes.
Authoritative gameplay results, room lifecycle decisions, and matchmaking
decisions must be written by the Spring backend.

## Consequences

- New durable app tables, functions, indexes, RLS policies, triggers, and grants
  belong in `supabase/migrations/`.
- Spring can read and write durable data, but it does not own schema changes.
- Local no-database mode may keep using in-memory runtime stores for fast
  debugging, but it is not a persistence substitute.
- Local or staging databases must be prepared from `supabase/migrations/` if
  they need durable DB behavior.
- Do not add a Docker fallback database to the live deploy stack.
- Do not add backend migration dependencies or migration directories for
  app-owned schema.

## Amendment: Two Environments (2026-10-06)

"The canonical database" is now one Supabase project per environment: one for
dev (`dev` branch) and one for production (`master` branch). The decision
itself is unchanged: `supabase/migrations/` is still the only schema path, and
each project is built purely from those files.

The CD pipeline applies migrations to the dev project on every merge into
`dev` and to the production project when a release to `master` is approved.
The separate `supabase-migrations.yml` workflow and its "master must contain
dev's migrations" guard were removed, because the two branches no longer share
a database.

## Follow-Up Work

- Move normal room create/join/list persistence toward the existing
  `RoomMetadataStore` abstraction so durable room metadata has one source of
  truth.
- Design played-game history tables in `supabase/migrations/`.
- Design friend/friend-request tables and RLS policies in `supabase/migrations/`.
