# Runtime Changelog

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
