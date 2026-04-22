# Runtime Changelog

## 2026-04-21 — Normalize Runtime Integration Pattern

### What changed
- **InMemoryRuntimeStore**: Replaced three per-game state maps (`highCardStatesByRoom`, `krigStatesByRoom`, `casinoStatesByRoom`) with a single generic `gameStatesByRoom` map. Added `loadOrInitGameState`, `saveGameState`, `removeGameState`. Replaced `casinoValueMap`/`saveCasinoValueMap` with generic `putGameConfig`/`getGameConfig`. Replaced hardcoded `maxPlayersFor` switch with data-driven `registerMaxPlayers` + lookup.
- **GameLoopService**: Added `onConnect` default method to `EnginePort` interface and `handleConnect` delegation method.
- **HighCardEnginePortAdapter**: Updated to use `loadOrInitGameState(roomCode, XxxState.class, supplier)` and `saveGameState`.
- **CasinoEnginePortAdapter**: Updated to use generic store methods. Registers `maxPlayers("casino", 2)` in constructor. Implements `onConnect` for casino value map parsing/validation/storage. Moved `parseCasinoValueMap` helper here from GameWsHandler.
- **GameWsHandler**: Removed `CasinoEngine` import, casino-specific connect block, and `parseCasinoValueMap`. Connect now delegates to `gameLoopService.handleConnect`.

### Why
Adding a new game (e.g. Snyd, 500) previously required modifying `InMemoryRuntimeStore`, `GameWsHandler`, and adding per-game boilerplate. Now new games only need an `EnginePort` adapter — no changes to the store or handler.
