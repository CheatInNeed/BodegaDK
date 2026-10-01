# Database Batching & Scalability

Status: design reference for implementation workstreams.

Related docs:

- `docs/design/ARCHITECTURE_AND_PROJECT_STRUCTURE.md`
- `docs/design/DATABASE_V1_SCHEMA_RESET.md`
- `docs/design/ROOM_AND_MATCHMAKING_ARCHITECTURE.md`
- `docs/decisions/0001-canonical-database-and-migrations.md`
- `docs/instructions/SUPABASE.md`

---

## 1. Context

BodegaDK uses Supabase Postgres as the canonical durable database. The Spring
backend connects through JDBC with HikariCP as the connection pool. The current
hosting environment imposes two constraints:

- HikariCP pool size: **20 connections** (tuned in Phase 2.2)
- Supabase PgBouncer in **transaction pooling mode** (port 6543)

Load testing of the lobby REST flow (`GET /health`, `GET /rooms`,
`GET /me/stats`, `POST /rooms`, `POST /rooms/{roomCode}/leave`) established
this baseline after Phase 1 (pool tuning + `@Transactional` scoping):

| Virtual users | Error rate | p95 latency | Status |
|---|---|---|---|
| 1 | 0.00% | 190.53 ms | Stable |
| 3 | 20.95% | 277.83 ms | Breaking |
| 5 | 30.80% | 580.36 ms | Degraded |
| 10 | 35.38% | 1268.71 ms | Saturated |
| 20 | 31.03% | 6147.60 ms | Overloaded |
| 50 | 45.85% | 5598.58 ms | Fully overloaded |

`GET /rooms` is the primary bottleneck: 51% error rate at 5 VU, 94% at 50 VU.
Its query (join on `rooms` + `room_players` with filter) is the most expensive
in the lobby flow and is called by every user. The p95 latencies at 5000ms
match the HikariCP `connection-timeout` — requests queue for a connection and
time out.

The bottleneck is not the game engine (which runs in-memory). It is the
REST layer's database access during lobby operations. Each lobby flow request
holds a database connection for sequential round-trips, exhausting the pool
under modest concurrency.

---

## 2. Scaling Model

Capacity is expressed as:

```
concurrent users = K × N
```

Where **N** is the database connection limit and **K** is the connection
efficiency factor (users supported per connection).

### Measured baseline (Phase 1.5)

```
N  = 10 (HikariCP pool size)
K  ≈ 0.1
capacity ≈ 1 stable concurrent user
```

Only 1 virtual user achieves 0% error rate. At 3 VU, connection pool contention
causes 21% errors. `GET /rooms` is the worst offender because its query is
expensive and global (every user executes it).

### Current state (Phase 2.2)

```
N  = 20 (HikariCP pool size)
K  ≈ 50
capacity ≈ 1000 concurrent users (0% error rate)
```

With read caching, write batching, CTE-based room creation, and PgBouncer-safe
JDBC configuration, 20 connections support 1000 concurrent users at 0% error
rate. Errors only appear at 5000+ VU from TCP/OS-level connection exhaustion
(not application errors).

| Supabase tier | Connection limit (N) | Efficiency (K) | Concurrent users |
|---|---|---|---|
| Free (current) | 20 | ~50 | ~1000 |
| Pro | 60 | ~50 | ~3000 |
| Team / custom | 100+ | ~50 | ~5000+ |

---

## 3. Current Database Interaction Patterns

### 3.1 Connection pool

File: `apps/server/src/main/resources/application.yml`

HikariCP is explicitly configured:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: ${HIKARI_MAX_POOL_SIZE:20}
      minimum-idle: ${HIKARI_MIN_IDLE:5}
      connection-timeout: 5000
      idle-timeout: 30000
      max-lifetime: 600000
      data-source-properties:
        prepareThreshold: 0
```

Pool size defaults to 20 and is configurable per environment via
`HIKARI_MAX_POOL_SIZE`.

**`prepareThreshold: 0`** disables PostgreSQL JDBC server-side prepared
statements. This is required because Supabase routes connections through
PgBouncer in transaction pooling mode, which reassigns backend PostgreSQL
connections between transactions. Without this setting, the JDBC driver's
named prepared statements (`S_1`, `S_2`, etc.) collide when the backend
changes, causing `bind message supplies N parameters, but prepared statement
requires M` errors under concurrent load. See Section 9 for details.

### 3.2 JDBC stores

All database access uses Spring `JdbcTemplate` with parameterized queries. No
ORM or JPA. All stores are in `apps/server/src/main/java/dk/bodegadk/runtime/`.

| Store | Purpose |
|---|---|
| `JdbcRoomMetadataStore` | Room CRUD, player lifecycle, matchmaking tickets |
| `JdbcMatchHistoryStore` | Match completion writes, stats, leaderboard |
| `JdbcChallengesStore` | Challenge CRUD + notification emission |
| `JdbcFriendsStore` | Friendship lifecycle |
| `JdbcNotificationsStore` | Notification CRUD |
| `JdbcLeaderboardQueryStore` | Leaderboard reads |
| `JdbcUserGameStatsQueryStore` | Per-user stats reads |
| `JdbcMatchHistoryQueryStore` | Match history pagination |

### 3.3 What is already in-memory

File: `apps/server/src/main/java/dk/bodegadk/runtime/InMemoryRuntimeStore.java`

The following are cached in `ConcurrentHashMap` and never hit the database:

- Active room runtime state (socket bindings, executors)
- Live engine game state per room
- Max-players-per-game configuration
- Session-to-player token mappings

File: `apps/server/src/main/java/dk/bodegadk/runtime/GameCatalogService.java`

Game catalog definitions are hardcoded in a static `LinkedHashMap` on
construction. Game lookups are O(1) in-memory and never query the database.

### 3.4 What hits the database on every request

These endpoints issue multiple sequential DB calls per invocation:
``
- `GET /rooms` -- queries `rooms` + `room_players` with join and filter
- `GET /me/stats` -- queries `user_game_stats` joined with `games`
- `GET /leaderboard` -- queries `leaderboard_scores` with rank window
- `GET /me/matches` -- queries `matches` + `match_players` with pagination
- `GET /friends` -- queries `friendships` with profile joins
- `GET /notifications` -- queries `notifications` with actor profile join

### 3.5 DB calls per flow

| Flow | DB calls | Scales with | Transactional |
|---|---|---|---|
| Room create + first join | 1 (CTE) | Fixed | No (implicit) |
| Game completion (2 players) | 6 | Fixed | Yes |
| Game completion (6 players) | 6 | Fixed | Yes |
| Matchmaking enqueue → match | ~8 | Matched players | No |
| Challenge create | ~9 | Fixed | No |
| Challenge accept | ~8 | Fixed | No |
| Friend request + accept | ~10 | Fixed | No |

### 3.6 Room creation detail

File: `apps/server/src/main/java/dk/bodegadk/runtime/JdbcRoomMetadataStore.java`
Method: `createRoomAndJoinHost()` (Phase 2.1)

A single CTE atomically inserts the room and joins the host:

```sql
WITH new_room AS (
    INSERT INTO public.rooms (...) VALUES (...)
    ON CONFLICT (room_code) DO NOTHING
    RETURNING id
)
INSERT INTO public.room_players (room_id, user_id, status, username_snapshot)
SELECT id, ?::uuid, 'JOINED', ?
FROM new_room
ON CONFLICT (room_id, user_id) DO UPDATE SET ...
```

One statement, implicit atomicity, no explicit transaction. `ON CONFLICT DO
NOTHING` handles rare room code collisions — the controller retries with a
new code. This replaced 3 sequential calls (`roomExists` SELECT + `createRoom`
INSERT + `upsertParticipant` INSERT) that held a connection for 3 round-trips
inside `@Transactional`.

### 3.7 Game completion detail

File: `apps/server/src/main/java/dk/bodegadk/runtime/JdbcMatchHistoryStore.java`
Method: `recordCompletedMatch()` (annotated `@Transactional`)

Sequential operations:

1. Query: fetch room context by room code
2. Query: check if completed match already exists
3. Update: set room status to `FINISHED`
4. Insert: create `matches` row
5. Query: load `room_players` participant list
6. Batch insert: all `match_players` rows via `batchUpdate()` (1 call)
7. Enqueue: stats + leaderboard writes to `DatabaseCacheService` (in-memory)

For any player count this is 6 DB calls. Stats and leaderboard writes are
deferred to the cache service's `@Scheduled` tick (see Section 5).

### 3.8 Public rooms query

File: `apps/server/src/main/java/dk/bodegadk/runtime/JdbcRoomMetadataStore.java`
Method: `publicRooms()` (Phase 2.1)

Rewritten from N+1 queries (main query + `loadParticipants()` per room in the
row mapper) to a single LEFT JOIN query. Results are grouped by room in Java
using a `LinkedHashMap`. The `DatabaseCacheService` calls this once every 2
seconds; controllers read from the in-memory snapshot.

### 3.9 Existing scheduled tasks

File: `apps/server/src/main/java/dk/bodegadk/ws/GameWsHandler.java`

One existing `@Scheduled` task runs every 5 seconds to sweep stale WebSocket
connections. `@EnableScheduling` is active on the application class.

Database-side, `cleanup_stale_room_presence()` runs via `pg_cron` once per
minute for stale participant and room cleanup.

---

## 4. Requirements

Any batching solution must satisfy these requirements:

### R1: Work within the Supabase connection ceiling

The solution must improve capacity within the current 15-connection limit.
Upgrading to a higher tier should provide linear capacity scaling with no code
changes.

### R2: Reduce per-request connection hold time

A single REST request must not hold a database connection for 5+ sequential
round-trips. Target: 1-2 round-trips for common flows.

### R3: Separate read-heavy from write-heavy paths

Public read endpoints (`GET /rooms`, `GET /leaderboard`) must not compete with
game-completion writes for the same connection pool. Caching or in-memory
materialization is required for high-frequency reads.

### R4: Preserve the existing test infrastructure

The 192 backend tests (engines, controllers, JDBC stores, runtime) must
continue to pass. New batching logic must be testable through the same
dependency injection patterns (mockable stores, fake engine ports).

### R5: Maintain atomicity of match completion

`matches` + `match_players` writes must remain in a single committed
transaction. These are the source of truth for game results.

### R6: Handle concurrent game-completion bursts

10+ games finishing within the same second must not cascade into pool
exhaustion and timeouts.

### R7: Allow eventual consistency for derived data only

- **Synchronous (source of truth):** `matches`, `match_players`
- **Eventually consistent (cached projections):** `user_game_stats`,
  `leaderboard_scores`, `notifications`

---

## 5. Unified Database Cache Service

### Goal

Consolidate read caching, write batching, and deferred writes into a single
service that keeps hot data in memory and minimizes database round-trips.
Instead of scattering cache logic across controllers, one service owns the
"don't hit the DB on the hot path" concern.

This is a standard game-backend pattern: maintain authoritative in-memory state,
persist asynchronously. Industry terms: "write-behind cache" for the write side,
"materialized view in memory" for the read side.

### Architecture

```
DatabaseCacheService (@Service, @Scheduled)
├── Read cache (served from memory, refreshed on timer)
│   ├── rooms snapshot        — global, all users see the same list
│   └── leaderboard snapshot  — global, per-game-slug
├── Write-behind buffer (enqueued by callers, flushed on timer)
│   ├── user_game_stats       — batched upserts
│   ├── leaderboard_scores    — batched upserts
│   └── notifications         — batched inserts
└── @Scheduled tick (every 1-2 seconds)
    ├── refresh rooms snapshot from DB
    ├── refresh leaderboard snapshot from DB
    └── flush all buffered writes via batchUpdate()
```

### Read cache: scheduled refresh

Instead of caching on first request with TTL expiry, a `@Scheduled` method
refreshes snapshots on a fixed interval. Requests read from in-memory fields
and never touch the database.

| Data | Refresh interval | Cache key | Staleness |
|---|---|---|---|
| Room list | 1-2 seconds | Global | Acceptable for lobby browsing |
| Leaderboard | 2-5 seconds | Per game slug | Acceptable for display |

Controllers call `DatabaseCacheService.getRooms()` and
`DatabaseCacheService.getLeaderboard(slug)` instead of querying stores
directly.

Note: `GET /me/stats` is per-user and not suitable for global scheduled
refresh. It remains a direct DB query but benefits from reduced pool contention
once rooms and leaderboard are off the hot path.

### Write-behind buffer

Non-critical writes are enqueued into `ConcurrentLinkedQueue` buffers instead
of executing immediately. The `@Scheduled` tick drains the queues and flushes
via `JdbcTemplate.batchUpdate()`, collapsing N individual writes into 1-3 DB
calls per flush.

| Table | Source of truth? | Buffered? | Acceptable lag |
|---|---|---|---|
| `matches` | Yes | No — synchronous | N/A |
| `match_players` | Yes | No — synchronous | N/A |
| `user_game_stats` | No (projection) | Yes | 1-2 seconds |
| `leaderboard_scores` | No (derived) | Yes | 1-2 seconds |
| `notifications` | No (informational) | Yes | 1-2 seconds |

Game completion flow becomes:

```
recordCompletedMatch()
  → synchronous: insert matches + match_players (transactional, 1-2 calls)
  → enqueue: stats + leaderboard + notification writes to buffer

@Scheduled tick
  → batchUpdate() all buffered writes (1-3 calls)
  → clear buffers
```

This preserves atomicity for source-of-truth data (R5) while moving derived
writes off the request path.

### Write batching within transactions

Independent of the write-behind buffer, the per-player loop in
`recordCompletedMatch()` should use `JdbcTemplate.batchUpdate()` to collapse
N×4 sequential calls into 3 batch calls:

```java
// Before: per-player loop (4 calls × N players)
for (String participantId : participantIds) {
    jdbcTemplate.update("insert into match_players ...");
    upsertUserGameStats(...);
    upsertLeaderboardScore(...);
}

// After: batch operations (3 calls total)
jdbcTemplate.batchUpdate("insert into match_players ...", batchArgs);
// stats + leaderboard go to write-behind buffer instead
```

With buffered stats/leaderboard, the synchronous transaction only does
`match_players` batch insert — one call regardless of player count.

### Risk: data loss on crash

If the server crashes between buffering and flushing, deferred writes are lost.
This is acceptable because:

- `user_game_stats` is rebuildable from `matches` + `match_players`
- `leaderboard_scores` is rebuildable from `matches` + `match_players`
- `notifications` are non-critical

A rebuild/backfill script or migration can recover these derived tables from
the source-of-truth tables at any time.

### Files to create

- `apps/server/src/main/java/dk/bodegadk/runtime/DatabaseCacheService.java`

### Files to modify

- `apps/server/src/main/java/dk/bodegadk/rest/RoomController.java`
  (read from cache service instead of query store)
- `apps/server/src/main/java/dk/bodegadk/rest/LeaderboardController.java`
  (read from cache service instead of query store)
- `apps/server/src/main/java/dk/bodegadk/runtime/JdbcMatchHistoryStore.java`
  (split synchronous from deferred, use batchUpdate for match_players)
- `apps/server/src/main/java/dk/bodegadk/ws/GameWsHandler.java`
  (wire deferred path into game completion)

### Testability

- Cache reads: verify controllers return data without a DB query when the
  service has a cached snapshot
- Write buffer: enqueue writes, trigger flush, assert DB state
- Batch writes: assert result counts after batched call
- Existing 192 backend tests must continue to pass

---

## 6. Connection Pool Tuning (done)

HikariCP pool configuration in `apps/server/src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: ${HIKARI_MAX_POOL_SIZE:20}
      minimum-idle: ${HIKARI_MIN_IDLE:5}
      connection-timeout: 5000
      idle-timeout: 30000
      max-lifetime: 600000
      data-source-properties:
        prepareThreshold: 0
```

Pool size increased from 10 to 20, minimum idle from 2 to 5. The pool size is
configurable per environment via `HIKARI_MAX_POOL_SIZE`.

`prepareThreshold: 0` is required for PgBouncer compatibility — see Section 9.

---

## 7. Implementation Order

### Phase 1: Connection pool tuning (done)

- Add explicit HikariCP config to `application.yml`
- Add `@Transactional` to multi-statement REST flows that currently auto-commit
  per statement (room create + join)
- Re-run load test to establish new baseline

### Phase 1.5: Load test suite (done)

- Created `tests/load/rest-capacity.mjs` load test runner
- Authenticates against Supabase for a real JWT, then runs stepped concurrency
  against the lobby flow
- Each step runs for a configurable duration (default 2 min) with 1s pause
- Records per-request latency, computes p50/p95/p99 and error rate
- Captures error response bodies and network errors for diagnostics
- Writes JSON + Markdown results to `tests/load/results/`
- Run with: `npm run load:rest:capacity`

### Phase 2: Unified database cache service (done)

Created `DatabaseCacheService` as a single `@Service` that owns all caching
and write batching:

- **Read cache:** `@Scheduled` refresh of rooms and leaderboard snapshots
  (2 second interval). Controllers read from memory, zero DB calls on the
  hot path.
- **Write batching:** Replaced per-player loops in `recordCompletedMatch()`
  with `JdbcTemplate.batchUpdate()`. Synchronous transaction only inserts
  `matches` + `match_players`.
- **Write-behind buffer:** Enqueue `user_game_stats`, `leaderboard_scores`
  writes. Flush via `batchUpdate()` on the same `@Scheduled` tick.
- **Wiring:** Updated `RoomController`, `LeaderboardController`, and
  `JdbcMatchHistoryStore` to use the cache service.
- All 192 tests pass. Load test re-run completed — see Section 8.

### Phase 2.1: POST /rooms write path optimization (done)

Reduced room creation from 3 sequential DB calls in a transaction to 1 CTE:

- **`RoomMetadataStore`:** Added `createRoomAndJoinHost()` default method
- **`JdbcRoomMetadataStore`:** CTE override (INSERT room + JOIN host in one
  statement with `ON CONFLICT DO NOTHING` for code collision handling)
- **`JdbcRoomMetadataStore`:** Rewrote `publicRooms()` from N+1 queries
  (loadParticipants per room) to single LEFT JOIN query
- **`RoomController`:** Removed `@Transactional` from `createRoom()`, replaced
  roomExists loop with `createRoomAndJoinHost()` retry loop

### Phase 2.2: PgBouncer compatibility fix (done)

Discovered and fixed the root cause of all remaining load test errors:

- **Root cause:** Supabase PgBouncer in transaction mode reassigns backend
  PostgreSQL connections between transactions. The JDBC driver's server-side
  prepared statements (`S_1`, `S_2`, etc.) collide when the backend changes,
  causing `bind message supplies N parameters, but prepared statement requires M`
  errors.
- **Fix:** Set `prepareThreshold: 0` in HikariCP `data-source-properties`,
  disabling server-side prepared statements entirely.
- **Pool tuning:** Increased pool size from 10 to 20, minimum idle from 2 to 5.
- **Result:** 0% error rate from 1 to 1000 VU. See Section 8.

---

## 8. Validation

### Load test runner

Script: `tests/load/rest-capacity.mjs`
npm command: `npm run load:rest:capacity`

The script authenticates against the live Supabase project, then runs stepped
concurrency against the local Spring server's lobby flow:

```
GET /health → GET /rooms → GET /me/stats → POST /rooms → POST /rooms/{code}/leave
```

Configuration via environment variables (defaults in parentheses):

| Variable | Default |
|---|---|
| `LOAD_BASE_URL` | `http://localhost:8080` |
| `LOAD_SUPABASE_URL` | from `.env.local` / `PUBLIC_SUPABASE_URL` |
| `LOAD_SUPABASE_ANON_KEY` | from `.env.local` / `PUBLIC_SUPABASE_ANON_KEY` |
| `LOAD_EMAIL` | (required) |
| `LOAD_PASSWORD` | (required) |
| `LOAD_STEPS` | `1,3,5,10,20,50` |
| `LOAD_STEP_DURATION_SEC` | `120` |
| `LOAD_PAUSE_MS` | `1000` |

Results are written to `tests/load/results/` (gitignored except `.gitkeep`).

### Baseline results (Phase 1.5, 2026-09-30)

| VU | Requests | Errors | Error % | p95 (ms) |
|---|---|---|---|---|
| 1 | 110 | 0 | 0.00% | 190.53 |
| 3 | 315 | 66 | 20.95% | 277.83 |
| 5 | 435 | 134 | 30.80% | 580.36 |
| 10 | 650 | 230 | 35.38% | 1268.71 |
| 20 | 435 | 135 | 31.03% | 6147.60 |
| 50 | 735 | 337 | 45.85% | 5598.58 |

Baseline K ≈ 0.1 (1 stable VU / 10 pool connections).

Primary bottleneck: `GET /rooms` (94% error rate at 50 VU). Secondary:
`POST /rooms` (44% at 50 VU). `GET /me/stats` holds up better (31% at 50 VU).

### Phase 2 results (2026-09-30)

| VU | Requests | Errors | Error % | p95 (ms) |
|---|---|---|---|---|
| 1 | 120 | 12 | 10.00% | 146.63 |
| 3 | 375 | 104 | 27.73% | 164.89 |
| 5 | 625 | 157 | 25.12% | 141.02 |
| 10 | 1250 | 210 | 16.80% | 147.67 |
| 20 | 2495 | 502 | 20.12% | 161.94 |
| 50 | 6080 | 1498 | 24.64% | 178.42 |

`GET /rooms` bottleneck eliminated (0% errors, p95 under 20ms). Throughput
increased 8× at 50 VU (735 → 6080 requests). Remaining errors were on write
endpoints and `GET /me/stats` — later identified as PgBouncer prepared
statement collisions (see Phase 2.2).

### Final results — Phase 2.1 + 2.2 (2026-09-30)

#### Low concurrency (1–50 VU)

| VU | Requests | Errors | Error % | p50 (ms) | p95 (ms) |
|---|---|---|---|---|---|
| 1 | 135 | 0 | 0.00% | 34.83 | 66.42 |
| 3 | 405 | 0 | 0.00% | 32.13 | 63.86 |
| 5 | 675 | 0 | 0.00% | 30.49 | 62.09 |
| 10 | 1350 | 0 | 0.00% | 30.97 | 63.27 |
| 20 | 2700 | 0 | 0.00% | 31.62 | 62.53 |
| 50 | 6750 | 0 | 0.00% | 32.18 | 67.87 |

**0% errors at all levels.** Latency flat — p95 under 68ms at 50 VU.

#### Medium concurrency (1–1000 VU)

| VU | Requests | Errors | Error % | p50 (ms) | p95 (ms) |
|---|---|---|---|---|---|
| 1 | 130 | 0 | 0.00% | 35.47 | 65.17 |
| 50 | 6750 | 0 | 0.00% | 32.05 | 68.58 |
| 100 | 13020 | 0 | 0.00% | 34.55 | 69.61 |
| 250 | 33345 | 0 | 0.00% | 28.97 | 85.79 |
| 500 | 35465 | 0 | 0.00% | 325.78 | 596.78 |
| 1000 | 37135 | 0 | 0.00% | 672.33 | 1318.71 |

**0% errors up to 1000 VU.** Latency stays sub-100ms p95 up to 250 VU. At
500–1000 VU latency increases (requests queue for connections) but every
request succeeds.

#### High concurrency (100–10000 VU)

| VU | Requests | Errors | Error % | p50 (ms) | p95 (ms) |
|---|---|---|---|---|---|
| 100 | 13165 | 0 | 0.00% | 29.28 | 95.70 |
| 500 | 35435 | 0 | 0.00% | 317.47 | 599.44 |
| 1000 | 37005 | 0 | 0.00% | 709.12 | 1273.10 |
| 5000 | 54105 | 8492 | 15.70% | 2558.78 | 7437.83 |
| 10000 | 65580 | 30115 | 45.92% | 6849.22 | 19062.14 |

At 5000+ VU, errors are TCP/OS-level (`fetch failed`, `terminated`) — the
load test client exhausts local TCP connections. The server returns no
application errors at any concurrency level. At 10000 VU, 23 server-side
I/O errors appear (`An I/O error occurred while sending to the backend`),
indicating Supabase connection limits under extreme load.

#### Before vs after

| Metric | Baseline (Phase 1.5) | Final (Phase 2.2) |
|---|---|---|
| First errors at | 3 VU | 5000 VU |
| POST /rooms error rate at 50 VU | 44% | 0% |
| Zero-error ceiling | 1 VU | 1000 VU |
| p95 at 50 VU | 5599ms | 68ms |
| Throughput at 50 VU | 735 req/30s | 6750 req/30s |
| K factor (users per connection) | 0.1 | 50 |

#### Per-endpoint improvement at 50 VU

| Endpoint | Baseline error % | Final error % | Baseline p95 | Final p95 |
|---|---|---|---|---|
| GET /health | 0% | 0% | — | 3ms |
| GET /rooms | 94% | 0% | 5599ms | 7ms |
| GET /me/stats | 31% | 0% | — | 64ms |
| POST /rooms | 44% | 0% | — | 80ms |
| POST /rooms/{code}/leave | — | 0% | — | 79ms |

---

## 9. PgBouncer Compatibility

### Problem

Supabase routes all database connections through PgBouncer in **transaction
pooling mode** (port 6543). In this mode, PgBouncer assigns a backend
PostgreSQL connection for the duration of a transaction, then returns it to
the pool. The next transaction from the same client may get a different
backend.

The PostgreSQL JDBC driver (pgjdbc) has a performance optimization: after
executing the same SQL statement `prepareThreshold` times (default: 5), it
promotes the statement to a **server-side prepared statement** with a name
like `S_1`, `S_2`, etc. The driver then sends only the statement name and
parameters on subsequent executions, skipping the parse step.

This optimization assumes the same backend connection persists across calls.
Under PgBouncer transaction mode, the driver thinks `S_5` is "the leaderboard
query" on backend A, but after a transaction boundary PgBouncer routes to
backend B where `S_5` is either undefined or mapped to a completely different
query. This produces errors like:

```
bind message supplies 7 parameters, but prepared statement 'S_23' requires 1
```

These errors appear non-deterministic and only under concurrent load (when
PgBouncer actively reassigns backends).

### Fix

```yaml
spring:
  datasource:
    hikari:
      data-source-properties:
        prepareThreshold: 0
```

Setting `prepareThreshold: 0` disables server-side prepared statements
entirely. Every query is sent as a simple extended query with inline
parameters. The performance cost is negligible — a few microseconds of parse
time per query — and is invisible in load test results (p95 under 68ms at 50
VU, dominated by network latency to Supabase).

### When to re-enable

If the application ever connects directly to PostgreSQL (bypassing PgBouncer),
`prepareThreshold` can be restored to the default (5) for a marginal
performance gain. This applies if:

- Migrating off Supabase to a self-hosted PostgreSQL
- Using Supabase's direct connection string (port 5432) instead of the pooled
  connection (port 6543)
- Using a connection pooler in **session mode** instead of transaction mode
