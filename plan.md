# Plan: Create Database Batching & Scalability Reference Document

## File Location

`docs/design/DATABASE_BATCHING_AND_SCALABILITY.md`

Follows the existing naming convention in `docs/design/` (UPPERCASE_SNAKE_CASE.md) alongside related docs like `DATABASE_V1_SCHEMA_RESET.md` and `ROOM_AND_MATCHMAKING_ARCHITECTURE.md`.

## Document Structure

The document will serve as a self-contained reference for working on any of the three workstreams independently. It will contain:

1. **Context & motivation** -- the scaling problem, load test findings, connection limits
2. **Current state analysis** -- exact file paths, DB call counts per flow, what's already cached vs what hits the DB
3. **Scaling model** -- the K×N formula, current ratio, target ratio
4. **Workstream 1: Cache public reads** -- what to cache, TTL strategy, which endpoints, implementation guidance
5. **Workstream 2: Batch write paths** -- which methods to change, batchUpdate vs PL/pgSQL, atomicity rules
6. **Workstream 3: Defer non-critical writes** -- what's deferrable, buffer/flush pattern, @Scheduled integration
7. **Connection pool tuning** -- HikariCP configuration to add to application.yml
8. **Requirements & constraints** -- the 7 requirements from our discussion, testability, consistency rules
9. **Validation plan** -- how to re-run the load test to prove K improved

## What I Will NOT Do

- No code changes
- No new migrations
- No changes to existing docs
- Just the one new reference document

## Content Sources

All content comes from:
- Our conversation (load test data, scaling model, requirements, workstream definitions)
- Codebase exploration (exact file paths, line numbers, current patterns)
- The existing docs (architecture, protocol, schema reset docs for cross-references)
