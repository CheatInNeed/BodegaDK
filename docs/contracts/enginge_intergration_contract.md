# BodegaDK Engine Integration Contract

## 1. Purpose

This contract defines how game engines integrate with the server runtime and web client.

Goals:
- Keep server-authoritative behavior.
- Avoid cross-team ownership overlap.
- Make game integrations predictable and testable.
- Prevent protocol drift between server and web.

This contract is the source of truth for integration boundaries and Definition of Done.

---

## 2. Scope

In scope:
- Engine domain integration into server loop.
- WS/REST interaction points required for gameplay.
- Public/private state projection rules.
- Required protocol and adapter behavior in web.
- Test and release gates for integration.

Out of scope:
- Visual design decisions.
- DB schema details for non-essential persistence.
- Auth provider implementation details.

---

## 3. System Ownership

### 3.1 Engine Team owns
- Game rules and transitions.
- Engine validation behavior.
- Engine state shape and projector logic.
- Engine unit tests.

### 3.2 Server Team owns
- REST room lifecycle endpoints.
- WebSocket connection and message loop.
- Action routing to correct engine.
- Authoritative state lifecycle and broadcasting.
- Error handling and operational logging.

### 3.3 Web Team owns
- URL routing and room bootstrap.
- Session/transport management.
- Game adapter mapping (state -> view, intent -> message).
- Gameplay UI behavior and interaction states.

### 3.4 Shared ownership
- Protocol contracts and documentation updates.
- Integration and E2E tests across modules.

---

## 4. Non-Negotiable Architecture Rules

1. Server is authoritative for all game outcomes.
2. Client sends intents only; no client rule authority.
3. Engine code is pure domain logic, independent of transport and DB.
4. Public and private state must be separated in outbound messages.
5. Any protocol change must update docs + web + server in same delivery window.

---

## 5. Integration Interfaces

## 5.1 Engine Runtime Contract

Each engine must expose:
- `gameId()`
- `init(playerIds)`
- `validate(action, state)`
- `apply(action, state)`
- `isFinished(state)`
- `getWinner(state)`

Validation rule:
- `validate` throws a domain rule exception for illegal moves.

Apply rule:
- `apply` returns next state (no in-place mutation expected from caller perspective).

## 5.2 View Projection Contract

Each engine must provide projector behavior:
- `toPublicView(state)` for all players.
- `toPrivateView(state, playerId)` for one player only.

Server must broadcast:
- `PUBLIC_UPDATE` to all room participants.
- `PRIVATE_UPDATE` only to target player.

## 5.3 Server Routing Contract

Server runtime must:
1. Resolve room and actor identity.
2. Resolve engine by room `gameId`.
3. Validate inbound action.
4. Apply state transition.
5. Project and emit outbound messages.
6. Emit `GAME_FINISHED` when terminal.

---

## 6. Transport and Protocol Contract

All WS messages use:
```json
{
  "type": "STRING",
  "payload": {}
}
```

Baseline gameplay flow:
1. Client sends `CONNECT` with `roomCode` + Supabase `accessToken`.
2. Server sends `STATE_SNAPSHOT`.
3. Client sends game actions.
4. Server emits `PUBLIC_UPDATE` and targeted `PRIVATE_UPDATE`.
5. Server emits `GAME_FINISHED` on terminal state.

Error contract:
- Server sends `ERROR` with `payload.message`.

Protocol governance:
- Any new game action/event type must update:
1. `docs/design/PROTOCOL.md`
2. `apps/server` implementation
3. `apps/web` protocol + adapter implementation

---

## 7. Per-Game Integration Requirements

For each new game (example: `highcard`), all items are required:

1. Engine exists and passes unit tests.
2. Engine is registered in server engine dispatch path.
3. Server loop can parse and route the game's action type(s).
4. Public/private projector outputs are mapped into protocol payloads.
5. Web adapter exists and is registered in active adapter list.
6. UI route for game uses real session flow (not local-only placeholder state).
7. Mock mode decision made explicitly:
- either implement mock support for game, or
- disable mock for that game and require real WS.

---

## 8. Room and Session Lifecycle (Server)

Minimum runtime behavior:
- `POST /api/rooms` creates room with game id metadata.
- `POST /api/rooms/{roomCode}/join` joins player/session.
- WS `CONNECT` binds socket to room + actor.
- State is loaded/initialized on connect/start.

Concurrency requirement:
- Actions are processed FIFO per room.
- No concurrent mutation of same room state.

---

## 9. Security and Validation Requirements

1. Validate all inbound payload shapes and required fields.
2. Validate actor authorization for room and action.
3. Never trust client-supplied state.
4. Reject malformed/unsupported actions with `ERROR`.
5. Keep client-private data isolated per player in server send path.

---

## 10. Testing Contract

## 10.1 Engine Team minimum
- Unit tests for init/validate/apply/finish/winner.
- Rule edge cases and invalid actions.

## 10.2 Server Team minimum
- Unit tests for routing and room action ordering.
- Integration tests for REST + WS flow.
- Tests for public/private broadcast correctness.

## 10.3 Web Team minimum
- Adapter tests for mapping and action build behavior.
- Session tests for message handling and state transitions.

## 10.4 Cross-team acceptance tests
- Two-client room test for public/private behavior.
- End-to-end game completion from URL-driven room entry.
- Protocol compatibility test against current docs.

---

## 11. Release and Merge Gates

A game integration may merge only when:
1. Engine, server, and web changes are compatible in same target branch.
2. `docs/design/PROTOCOL.md` is updated if payload/message changes occurred.
3. Build and test suites for touched modules pass.
4. Manual E2E verification is recorded.

Recommended branch policy:
- Integrate engine into canonical integration branch before server/web final wiring.
- Do not deploy branch state where engine exists but server route is missing.

---

## 12. Definition of Done (Game Playable on URL)

A game is considered URL-playable only when all are true:
- Route opens room for selected game.
- Session connects to real backend WS.
- Actions are accepted/rejected by server-authoritative validation.
- UI receives and renders public/private updates from server.
- Game reaches terminal condition and emits `GAME_FINISHED`.
- No local-only fake gameplay path is used for production behavior.

---

## 13. Current Known Gaps (Snapshot: 2026-04-29)

### 13.1 Game Snapshot: `highcard`

- Game ID: `highcard`
- Engine status: implemented and wired through the shared engine port pattern.
- Runtime status: registered with the WebSocket room session and lobby/start flow.
- URL route status: playable through the shared `view=room` flow.
- Persistence status: completed match results write through the shared
  match-history/stat/leaderboard completion path.
- Remaining limitation: active in-game snapshots are still runtime memory, not
  durable replay state.

### 13.2 System Baseline For Planning

| System | What we currently have | What is missing | What needs to change |
|---|---|---|---|
| Branch/Release Integration | Game/server/web integrations are on the current platform branch | Merge target and release timing | Keep migrations, backend, and frontend deployed together |
| Game Engine Domain | HighCard, Snyd, Casino, Krig, and Fem engines/adapters | Durable active-game snapshots | Add replay/recovery storage when needed |
| Server Runtime (REST + WS) | Authenticated REST, `/ws`, per-room queue, engine ports, JDBC metadata/social/history stores | Horizontal shared runtime state | Add Redis/shared runtime store before multi-instance scaling |
| Protocol Contract | REST/WS contracts documented in `docs/design/PROTOCOL.md` | Formal generated OpenAPI/TS schemas | Add generated schemas if contract drift becomes painful |
| Web Session/Transport Layer | Generic room session, WS transport, mock transport, registered game adapters | Robust reconnect replay | Add resumable snapshot/replay strategy |
| Infra/Deployment | Nginx strips `/api`, proxies `/ws`, server uses Supabase datasource | Automated environment validation before deploy | Add deploy preflight checks |

---

## 14. Change Management

When changing this contract:
1. Update file in one PR.
2. Link impacted server/web/engine tasks.
3. Confirm with all three owner groups (engine/server/web).
