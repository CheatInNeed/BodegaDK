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
1. Client sends `CONNECT` with `roomCode` + `token`.
2. Server sends `STATE_SNAPSHOT`.
3. Client sends game actions.
4. Server emits `PUBLIC_UPDATE` and targeted `PRIVATE_UPDATE`.
5. Server emits `GAME_FINISHED` on terminal state.

Error contract:
- Server sends `ERROR` with `payload.message`.

Protocol governance:
- Any new game action/event type must update:
1. `docs/PROTOCOL.md`
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
2. `docs/PROTOCOL.md` is updated if payload/message changes occurred.
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

## 13. Current Known Gaps (Snapshot: 2026-03-11, branch: `server-v0.1`)

### 13.1 Game Snapshot: `highcard`

- Game ID: `highcard`
- Engine status: implemented (`HighCardEngine`, `HighCardAction`, `HighCardState`, `HighCardViewProjector`) and unit-tested.
- Branch/release status: engine commit `2fd3ff3` is present on `server-v0.1` and `Stupid1pCardGame`, but not guaranteed on `dev`/`master`.
- Server registration status: missing production engine registry/dispatcher path from room `gameType` to HighCard engine.
- WS action routing status: generic WS loop exists, but no HighCard action parser/routing contract is wired.
- Public/private projector status: projector exists in engine domain, but is not wired into runtime outbound mapping.
- Web adapter status: missing `highcardAdapter`; active adapter list still Snyd-only.
- URL route status: HighCard route exists but uses local UI-only state, not real room session flow.
- Mock mode status: mock transport simulates only Snyd.
- Protocol doc status: `docs/PROTOCOL.md` does not define HighCard client action/event payloads.
- E2E status: not URL-playable end-to-end against server-authoritative runtime.
- Build/test status:
  - `mvn -q test` passes in `apps/server`.
  - `npm run build -w apps/web` passes.
  - `mvn -q -DskipTests package` fails because two Spring Boot main classes exist.
- Blockers:
  - Packaging blocker: duplicate main-class candidates (`dk.bodegadk.BodegaServerApplication`, `dk.bodegadk.server.BodegaServerApplication`).
  - Infra/API contract mismatch risk: nginx strips `/api` prefix, while controller is mapped at `/api/rooms`.
  - Engine integration seam is still placeholder (`GameLoopService.EnginePort` missing production bean).
  - Runtime persistence/session durability is still in-memory scaffolding.

### 13.2 System Baseline For Planning

| System | What we currently have | What is missing | What needs to change |
|---|---|---|---|
| Branch/Release Integration | HighCard commit is on `server-v0.1` + `Stupid1pCardGame` | Not integrated into `dev`/`master` | Decide canonical integration branch and merge policy |
| Game Engine Domain | HighCard and Snyd engine-domain classes | Runtime registration/selection from network `gameId` | Add engine registry/dispatcher and decode bridge |
| Server Runtime (REST + WS) | `/api/rooms`, `/api/rooms/{roomCode}/join`, `/ws`, per-room queue, loop service | Persistent adapters + production engine integration | Wire engine port and DB/session stores without changing protocol bodies |
| Protocol Contract | WS envelope + Snyd actions/events documented | HighCard action/event contract | Extend `docs/PROTOCOL.md` and TS protocol types |
| Web Session/Transport Layer | Generic room session + WS/mock transport | HighCard action mapping path | Add HighCard protocol mapping in adapter/session flow |
| Web UI/Game Integration | HighCard UI screen/route present | Route is local-only and not backend-driven | Move HighCard route to real `createGameRoomSession(...)` flow |
| Adapter Layer | `snydAdapter` exists and is registered | No `highcardAdapter` | Implement and register `highcardAdapter` |
| Mock/Dev Simulation | Snyd mock server simulation | No HighCard mock behavior | Add HighCard mock or enforce real WS for HighCard tests |
| Infra/Deployment | Nginx and compose wiring for `/api` + `/ws` exists | API-prefix mismatch risk + server packaging blocker | Align API path contract and fix duplicate Spring Boot main class |

---

## 14. Change Management

When changing this contract:
1. Update file in one PR.
2. Link impacted server/web/engine tasks.
3. Confirm with all three owner groups (engine/server/web).
