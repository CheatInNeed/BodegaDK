# Runtime Changelog

## 2026-09-25 -- Health checks, metrics and monitoring stack (observability phases 2-3)

### What changed
- **Spring Boot 3.3.3 → 3.5.16** (3.3 was out of OSS support; 3.4+ has
  native JSON logging).
- **Actuator on internal port 8081**: `/actuator/health` (with database),
  `/actuator/health/liveness`, `/actuator/health/readiness`,
  `/actuator/prometheus`. Not proxied by nginx; `GET /health` on 8080 is
  unchanged.
- **Metrics**: REST/JVM/database pool metrics from Spring Boot, plus BodegaDK
  metrics for connected players, rooms by status, game actions (by game and
  ok/rejected/crash, with timings), games started/finished, refused
  WebSocket CONNECTs by reason, heartbeat timeouts, match history write
  failures and push outcomes.
- **Docker**: the server image includes `curl`; compose healthcheck on
  Actuator liveness; nginx starts only when the server is healthy; the server
  logs ECS JSON in Docker.
- **CD integration**: the deploy job also copies `infra/monitoring/` to the
  host, and images are only published after the `infra-config` checks pass.
- **nginx**: JSON access log with `request_id`, status and timings.
- **Monitoring profile** (`infra/monitoring/`, `COMPOSE_PROFILES=monitoring`):
  Prometheus with alert rules (visible only, no notifications yet), Loki,
  Grafana Alloy and Grafana with a provisioned "BodegaDK Overview" dashboard.
  Grafana/Prometheus bind to 127.0.0.1 only.
- **CI**: new `infra-config` job validates compose, nginx, Prometheus rules
  (with unit tests), Loki, Alloy and dashboard JSON.

### Why
See `docs/decisions/0002-observability-stack.md` and
`docs/devops/observability.md`.

## 2026-09-25 -- Server logging (observability phase 1)

### What changed
- **Room task crashes are no longer silent**: `InMemoryRuntimeStore.submit` now
  logs exceptions from room worker tasks. Before, `executor.submit` stored them
  in an unread `Future`, so a crashing engine left the room looking frozen with
  nothing in the logs.
- **Crashing game actions answer the player**: `GameWsHandler` catches
  unexpected exceptions from a game action, logs them with a stack trace, and
  sends the actor `ERROR` with `RULES_NOT_AVAILABLE: action failed on server`
  (existing error prefix, no protocol change).
- **Match results survive a history write failure**: if
  `recordCompletedMatch` throws, the error is logged and `GAME_FINISHED` is
  still broadcast. Before, the players never received the result.
- **WebSocket lifecycle logging**: connect, CONNECT rejections with reason,
  disconnects, heartbeat timeouts, transport errors, invalid messages, game
  start/finish and room close.
- **Push logging**: failed push sends are logged as WARN instead of ignored;
  expired subscriptions and "push disabled" are logged at INFO.
- **Request IDs and log tags**: new `dk.bodegadk.logging` package.
  `RequestIdFilter` tags every REST request and returns `X-Request-Id`;
  `LogContext` adds `req`, `room` and `player` tags to log lines;
  `UnexpectedErrorLoggingResolver` logs unhandled REST exceptions with the
  request ID (the 500 response body is unchanged).
- **Infra**: nginx forwards `X-Request-Id: $request_id` to the server; Docker
  logs rotate at 3 x 10 MB; `BODEGADK_LOG_LEVEL` sets the server log level.

### Why
The server previously wrote no application logs at all, and several failures
were swallowed without a trace. See `docs/instructions/LOGGING.md`.

## 2026-04-29 -- Supabase V1 Platform, Friends, Challenges, Notifications

### What changed
- **Canonical Supabase schema**: Added the V1 schema reset and game catalog
  seed migrations. Supabase Postgres is now the durable source of truth for
  profiles, avatars, rooms, room players, matchmaking tickets, match history,
  per-game stats, all-time leaderboard scores, friendships, challenges, and
  notifications. Spring no longer owns app schema migrations through Flyway.
- **Authenticated runtime**: Room, matchmaking, profile, leaderboard, friends,
  challenges, notifications, and WebSocket flows now derive durable user
  identity from Supabase JWTs instead of guest/session-token fallbacks.
- **Durable room and matchmaking metadata**: `JdbcRoomMetadataStore` persists
  room lifecycle, participants, selected games, heartbeats, and quick-play
  tickets. Runtime socket bindings and active engine snapshots remain
  in-memory.
- **Match history, profile stats, and leaderboard**: Completed games write
  permanent match rows, match-player rows, cached user stats, and all-time win
  leaderboard scores. Profile and leaderboard UI now read those authenticated
  backend APIs.
- **Friends system**: Added backend friend request/list/accept/decline/remove
  endpoints backed by the existing `friendships` table, plus Profile-page UI
  for friends, incoming requests, outgoing requests, and add-by-username.
- **Challenges system**: Added direct friends-only Snyd challenges. Accepting a
  challenge creates a private `LOBBY` room with both users attached and returns
  normal room navigation data.
- **Notifications system**: Added notification list/read/read-all APIs, social
  notification emission for friend requests and challenges, and a topbar
  notification dropdown with unread badge and challenge actions.
- **Local/deploy tooling**: Root npm scripts now generate public web config,
  run local web/server development together, and require explicit Supabase
  datasource/JWT environment for DB-backed server operation.

### Why
This branch moves BodegaDK from mostly local/placeholder multiplayer surfaces
to an authenticated Supabase-backed platform foundation while preserving the
core invariant that Spring remains authoritative for room lifecycle, game
rules, matchmaking decisions, and result writes.

## 2026-04-25 -- Krig Multiplayer UI Wiring

### What changed
- **Krig room view**: Replaced the leftover standalone/local Krig prototype
  mount with the server-driven game-room renderer. The visible Krig table now
  renders from `RoomSessionState` public/private updates instead of local deck
  state.
- **Player names**: Krig now uses the shared room player-name mapping, so
  authenticated users render their profile username and anonymous players fall
  back to the guest display label.
- **Perspective seating**: The current player is always anchored at the bottom
  of the Krig table and the opponent is always shown at the top, so each
  browser gets its own player perspective.
- **Ready indication**: Added a non-text visual ready state for Krig seats,
  including animated ready pips and a subtle glow around the ready player's
  pile/table-card area.

### Why
The local Krig prototype was still mounting inside the room route with
hardcoded player names and browser-local flip logic. That bypassed the
authoritative WebSocket room session, so one browser could appear to flip both
cards while the other browser did not update. The room now keeps the existing
Krig look while using the multiplayer protocol state for rendering and actions.

## 2026-04-24 — Centralized Lobby Coordinator For Game Switching

### What changed
- **LobbyCoordinator**: New centralized room-domain service for `SELECT_GAME`.
  It validates target games through `GameCatalogService`, enforces lobby-only
  host-driven switching, and updates `selectedGame` through
  `InMemoryRuntimeStore`.
- **GameLoopService**: Routes `SELECT_GAME` through the lobby coordinator
  before engine resolution, while preserving shared state persistence and
  versioning behavior.
- **HighCardEnginePortAdapter / CasinoEnginePortAdapter / SnydEnginePortAdapter / FemEnginePortAdapter**:
  Removed decentralized `SELECT_GAME` handling and engine-specific
  lobby-transition allowlists. Adapters now only own `START_GAME`,
  snapshots, and in-game rules.
- **Tests**: Added centralized transition coverage proving that every
  `lobbyEnabled` game can switch to every other `lobbyEnabled` game,
  including Krig.

### Why
Fixes directional lobby-switch bugs caused by duplicated per-engine
allowlists and restores a clean separation between lobby orchestration and
active gameplay rules.

## 2026-04-22 — Danish 500 Port Adapter (WebSocket Wiring)

### What changed
- **FemEnginePortAdapter**: New `@Component` implementing `GameLoopService.EnginePort` for Danish 500. Handles all game commands: `DRAW_FROM_STOCK`, `DRAW_FROM_DISCARD`, `TAKE_DISCARD_PILE`, `LAY_MELD`, `EXTEND_MELD`, `SWAP_JOKER`, `DISCARD`, `CLAIM_DISCARD`, `PASS_GRAB`, plus shared `START_GAME`. Registers max 6 players.
- **FemEnginePortAdapterTest**: 9 integration tests covering start, reject, draw, meld, discard, grab phase, and snapshot flows.

### Why
Connects the FemEngine domain layer to the WebSocket game loop so Danish 500 is playable from the client. Follows the same port adapter pattern as Snyd.

## 2026-04-21 — Danish 500 Game Engine

### What changed
- **Card primitive**: Added Joker support (`JK1`, `JK2` format). `parse()` handles "JK" prefix, `value()` returns 0 for jokers.
- **Deck primitive**: Added `standard52WithJokers()` factory for 54-card deck.
- **New engine**: `FemEngine`, `FemState`, `FemAction`, `FemViewProjector` in `dk.bodegadk.server.domain.games.fem` package.
  - Rummy-style melding game (Danish 500).
  - 2-6 players, 7 cards each, multi-round with cumulative scoring.
  - Actions: draw, lay melds, extend melds, swap jokers, discard, claim discards.
  - First to 500 cumulative points wins.

### Why
Danish 500 is the next game to be added to the platform. This implements the pure domain engine (no transport/adapter wiring yet).

## 2026-04-21 — Normalize Runtime Integration Pattern

### What changed
- **InMemoryRuntimeStore**: Replaced three per-game state maps (`highCardStatesByRoom`, `krigStatesByRoom`, `casinoStatesByRoom`) with a single generic `gameStatesByRoom` map. Added `loadOrInitGameState`, `saveGameState`, `removeGameState`. Replaced `casinoValueMap`/`saveCasinoValueMap` with generic `putGameConfig`/`getGameConfig`. Replaced hardcoded `maxPlayersFor` switch with data-driven `registerMaxPlayers` + lookup.
- **GameLoopService**: Added `onConnect` default method to `EnginePort` interface and `handleConnect` delegation method.
- **HighCardEnginePortAdapter**: Updated to use `loadOrInitGameState(roomCode, XxxState.class, supplier)` and `saveGameState`.
- **CasinoEnginePortAdapter**: Updated to use generic store methods. Registers `maxPlayers("casino", 2)` in constructor. Implements `onConnect` for casino value map parsing/validation/storage. Moved `parseCasinoValueMap` helper here from GameWsHandler.
- **GameWsHandler**: Removed `CasinoEngine` import, casino-specific connect block, and `parseCasinoValueMap`. Connect now delegates to `gameLoopService.handleConnect`.

### Why
Adding a new game (e.g. Snyd, 500) previously required modifying `InMemoryRuntimeStore`, `GameWsHandler`, and adding per-game boilerplate. Now new games only need an `EnginePort` adapter — no changes to the store or handler.
