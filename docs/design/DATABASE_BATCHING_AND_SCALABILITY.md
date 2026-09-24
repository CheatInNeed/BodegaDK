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
hosting environment imposes two hard limits:

- HikariCP default pool size: **10 connections** (unconfigured)
- Supabase session-mode limit: **15 concurrent database clients**

Load testing of the lobby REST flow (`GET /health`, `GET /rooms`,
`GET /me/stats`, `POST /rooms`, `POST /rooms/{roomCode}/leave`) showed:

| Virtual users | Error rate | p95 latency | Status |
|---|---|---|---|
| 5 | 0.00% | 82.86 ms | Stable |
| 10 | 3.43% | 351.41 ms | Beginning instability |
| 15 | 5.87% | 30003.94 ms | Saturated |
| 20+ | 13-24% | 30000+ ms | Fully overloaded |

The bottleneck is not the game engine (which runs in-memory). It is the
REST layer's database access during lobby operations. Each lobby flow request
holds a database connection for 5+ sequential round-trips, exhausting the pool
under modest concurrency.

---

## 2. Scaling Model

Capacity is expressed as:

```
concurrent users = K × N
```

Where **N** is the database connection limit and **K** is the connection
efficiency factor (users supported per connection).

### Current state

```
N  = 15 (Supabase session-mode limit)
K  ≈ 0.33
capacity ≈ 5 concurrent users
```

Each user in the lobby flow holds a connection for 5 sequential DB calls. With
15 available connections, only ~5 users can execute flows concurrently before
queuing begins.

### Target state

```
N  = 15 (same free-tier limit)
K  ≈ 10
capacity ≈ 150 concurrent users
```

With application-side batching and caching, the same 15 connections should
support ~150 concurrent users. Scaling to 1000 users then requires only
increasing N to ~100 (available on higher Supabase tiers) with no code changes.

| Supabase tier | Connection limit (N) | Efficiency (K) | Concurrent users |
|---|---|---|---|
| Free (current) | 15 | ~10 | ~150 |
| Pro | 60 | ~10 | ~600 |
| Team / custom | 100+ | ~10 | ~1000+ |

---

## 3. Current Database Interaction Patterns

### 3.1 Connection pool

File: `apps/server/src/main/resources/application.yml`

No explicit HikariCP configuration exists. Spring Boot defaults apply (~10 pool
size). The pool is not tuned for concurrency.

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

- `GET /rooms` -- queries `rooms` + `room_players` with join and filter
- `GET /me/stats` -- queries `user_game_stats` joined with `games`
- `GET /leaderboard` -- queries `leaderboard_scores` with rank window
- `GET /me/matches` -- queries `matches` + `match_players` with pagination
- `GET /friends` -- queries `friendships` with profile joins
- `GET /notifications` -- queries `notifications` with actor profile join

### 3.5 DB calls per flow

| Flow | DB calls | Scales with | Transactional |
|---|---|---|---|
| Room create + first join | ~5 | Fixed | No |
| Game completion (2 players) | 11-13 | Player count (+4/player) | Yes |
| Game completion (6 players) | 27+ | Player count (+4/player) | Yes |
| Matchmaking enqueue → match | ~8 | Matched players | No |
| Challenge create | ~9 | Fixed | No |
| Challenge accept | ~8 | Fixed | No |
| Friend request + accept | ~10 | Fixed | No |

### 3.6 Game completion detail

File: `apps/server/src/main/java/dk/bodegadk/runtime/JdbcMatchHistoryStore.java`
Method: `recordCompletedMatch()` (annotated `@Transactional`)

Sequential operations:

1. Query: fetch room context by room code
2. Query: check if completed match already exists
3. Update: set room status to `FINISHED`
4. Insert: create `matches` row
5. Query: load `room_players` participant list
6. **Per-player loop** (repeated for each participant):
   - Insert: `match_players` row
   - Query + upsert: `user_game_stats`
   - Query + upsert: `leaderboard_scores`

For a 2-player game this is 11-13 DB calls. For a 6-player Snyd game this is
27+ calls, all within one transaction holding one connection.

### 3.7 Existing scheduled tasks

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

The 191 backend tests (engines, controllers, JDBC stores, runtime) must
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

## 5. Workstream 1: Cache Public Reads

### Goal

Eliminate database pressure from high-frequency read endpoints by serving
results from an in-memory cache with a short TTL.

### Endpoints to cache

| Endpoint | Current behavior | Cache strategy |
|---|---|---|
| `GET /rooms` | DB query per request | TTL cache, 2-5 seconds |
| `GET /leaderboard` | DB query per request | TTL cache, 5-10 seconds |
| `GET /me/stats` | DB query per request | TTL cache, 5-10 seconds per user |

### Implementation approach

Add a lightweight in-memory cache layer in the Spring runtime. This can be:

- A `ConcurrentHashMap` with timestamped entries and lazy eviction
- Spring `@Cacheable` with a simple TTL cache manager
- A dedicated `CachedReadStore` service wrapping the existing query stores

The cache key for `/rooms` is global (all users see the same public room list).
The cache key for `/me/stats` and `/leaderboard` may include user ID or game
slug.

### Files to modify

- `apps/server/src/main/java/dk/bodegadk/rest/RoomController.java`
- `apps/server/src/main/java/dk/bodegadk/rest/LeaderboardController.java`
- `apps/server/src/main/java/dk/bodegadk/rest/ProfileController.java`
- New: cache service or configuration class

### Cache invalidation

- `/rooms` cache is invalidated by TTL expiry only. 2-5 second staleness is
  acceptable for lobby browsing.
- `/leaderboard` cache is invalidated by TTL or explicitly after a batch of
  deferred leaderboard writes flushes (see Workstream 3).
- `/me/stats` cache is invalidated by TTL or after the owning user's deferred
  stats write flushes.

### K impact

This is the highest-impact workstream. Room listing is the proven bottleneck.
200 users polling `/rooms` will hit 0 DB calls instead of 200 per cache window.

### Testability

Cache behavior can be tested by injecting a mock clock or by verifying that the
underlying query store is called at most once per TTL window.

---

## 6. Workstream 2: Batch Write Paths

### Goal

Reduce the number of DB round-trips in write-heavy flows, particularly game
completion.

### Approach A: `JdbcTemplate.batchUpdate()`

Replace the per-player loop in `JdbcMatchHistoryStore.recordCompletedMatch()`
with batch operations.

Current (per-player loop, 4 calls each):

```java
for (String participantId : participantIds) {
    jdbcTemplate.update("insert into match_players ...");
    upsertUserGameStats(...);   // query + upsert
    upsertLeaderboardScore(...); // query + upsert
}
```

Batched:

```java
jdbcTemplate.batchUpdate("insert into match_players ...", batchArgs);
jdbcTemplate.batchUpdate("insert into user_game_stats ... on conflict ...", batchArgs);
jdbcTemplate.batchUpdate("insert into leaderboard_scores ... on conflict ...", batchArgs);
```

This collapses N×4 calls into 3 batch calls regardless of player count.

### Approach B: PL/pgSQL server-side function

Move the entire completion flow into a single Postgres function:

```sql
create function record_match_result(payload jsonb) returns void ...
```

The Java side calls one statement:

```java
jdbcTemplate.update("select record_match_result(?::jsonb)", json);
```

This collapses 11-27+ calls into 1 round-trip.

### Recommendation

Start with Approach A (`batchUpdate`). It stays in Java, is testable with
existing patterns, and gives a ~4x reduction in round-trips. Move to Approach B
only if Approach A proves insufficient under load.

### Files to modify

- `apps/server/src/main/java/dk/bodegadk/runtime/JdbcMatchHistoryStore.java`
- Potentially: `JdbcChallengesStore.java` (challenge accept has ~8 calls)

### Atomicity

The existing `@Transactional` on `recordCompletedMatch()` already ensures
atomicity. Batch operations within the same transaction preserve this guarantee.

### Testability

Batch writes are testable the same way as individual writes. The existing JDBC
store tests can verify batch behavior by asserting on result counts after the
batched call.

---

## 7. Workstream 3: Defer Non-Critical Writes

### Goal

Move derived-data writes off the request-critical path so they do not hold
connections during user-facing flows.

### What is deferrable

| Table | Source of truth? | Deferrable? | Acceptable lag |
|---|---|---|---|
| `matches` | Yes | No | N/A |
| `match_players` | Yes | No | N/A |
| `user_game_stats` | No (cached projection) | Yes | 2-5 seconds |
| `leaderboard_scores` | No (derived from wins) | Yes | 2-5 seconds |
| `notifications` | No (informational) | Yes | 2-5 seconds |

### Implementation approach

Add a write-behind buffer service:

```
GameCompletion
  → synchronous: insert matches + match_players (1-2 calls)
  → buffer: enqueue stats + leaderboard + notification writes

@Scheduled flush (every 2-5 seconds)
  → batch all buffered writes into 1-3 DB calls
  → clear buffer
```

The buffer is an in-memory `ConcurrentLinkedQueue` of pending write operations.
A `@Scheduled` method flushes the queue on a fixed interval using
`batchUpdate()`.

### Files to modify

- `apps/server/src/main/java/dk/bodegadk/runtime/JdbcMatchHistoryStore.java`
  (split synchronous from deferred writes)
- New: `DeferredWriteService` or similar buffer/flush service
- `apps/server/src/main/java/dk/bodegadk/ws/GameWsHandler.java`
  (wire deferred path into game completion)

### Risk: data loss on crash

If the server crashes between buffering and flushing, deferred writes are lost.
This is acceptable because:

- `user_game_stats` is rebuildable from `matches` + `match_players`
- `leaderboard_scores` is rebuildable from `matches` + `match_players`
- `notifications` are non-critical

A rebuild/backfill script or migration can recover these derived tables from
the source-of-truth tables at any time.

### Testability

The deferred write service can be tested by:

- Enqueuing writes, advancing a mock clock, and asserting the batch flush fires
- Verifying that the synchronous path commits only `matches` + `match_players`
- Verifying that stats/leaderboard are absent immediately after completion but
  present after flush

---

## 8. Connection Pool Tuning

Independent of the three workstreams, the HikariCP pool should be explicitly
configured.

### Recommended configuration

Add to `apps/server/src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: ${HIKARI_MAX_POOL_SIZE:10}
      minimum-idle: ${HIKARI_MIN_IDLE:2}
      connection-timeout: 5000
      idle-timeout: 30000
      max-lifetime: 600000
```

This makes the pool size configurable per environment. On the free Supabase tier,
keep it at 10 (below the 15 session limit). On higher tiers, increase via
environment variable.

### Why this matters

Explicit pool configuration prevents silent defaults from masking capacity
limits. It also allows the load test to be re-run with different pool sizes to
measure the effect of application-side changes independently from pool scaling.

---

## 9. Implementation Order

### Phase 1: Connection pool tuning

- Add explicit HikariCP config to `application.yml`
- Add `@Transactional` to multi-statement REST flows that currently auto-commit
  per statement (room create + join, challenge accept)
- Re-run load test to establish new baseline

### Phase 2: Cache public reads (Workstream 1)

- Implement TTL cache for `GET /rooms`
- Implement TTL cache for `GET /leaderboard`
- Re-run load test to measure K improvement

### Phase 3: Batch write paths (Workstream 2)

- Replace per-player loops with `batchUpdate()` in `JdbcMatchHistoryStore`
- Batch challenge-accept multi-call flow
- Add tests for batch behavior

### Phase 4: Defer non-critical writes (Workstream 3)

- Split `recordCompletedMatch()` into synchronous + deferred
- Add `DeferredWriteService` with `@Scheduled` flush
- Add tests for buffer/flush lifecycle
- Re-run load test to measure final K

---

## 10. Validation

### Load test re-run

After each phase, re-run the REST capacity test with the same parameters
(5, 10, 15, 20, 25, 50 virtual users, 2 minutes per step, 1 second pause)
and compare:

- Error rate at each step
- p95 latency at each step
- Maximum stable virtual user count (0% error rate threshold)

### Target result

The load test should show 0% error rate at 15+ virtual users on the free-tier
connection limit, demonstrating that K has improved from ~0.33 to ~10.

### Derived capacity claim

If the load test shows 0% error rate at M virtual users with N=15 connections:

```
K = M / N
projected capacity at N=100: K × 100 users
```

This allows the report to state: "With application-side optimizations, the
system supports K×N concurrent users. On the free tier (N=15) this was validated
at M users. Launching on a plan with N=100 connections would support K×100
concurrent users with no code changes."
