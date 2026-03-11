# Game Engine – Integration Guide

This document explains the **pure game-logic layer** under 
`dk.bodegadk.server.domain` and how to wire it into the server (WebSocket, REST, rooms).


---

## Key design decisions

### 1. Engines are stateless and immutable
`apply(action, state)` returns a **new** state. It never mutates the input.
This means you can safely keep a history of states for undo/replay/logging.

### 2. Validation is separate from application
Always call `validate(action, state)` before `apply(action, state)`.
`validate` throws `GameEngine.GameRuleException` if the move is illegal.

### 3. Views are separated from logic
`ViewProjector<S>` handles what each player can see.
- `toPublicView(state)` → visible to all (pile size, current turn, last claim)
- `toPrivateView(state, playerId)` → visible to one player (their hand)

This is what you serialize and send over WebSocket — **never send the raw state**.

---

## How to use the engine (pseudocode for server integration)

```java
// 1. Pick the engine for the game type
GameEngine<SnydState, SnydAction> engine = new SnydEngine();
ViewProjector<SnydState> projector = new SnydViewProjector();

// 2. Initialize when all players are ready
SnydState state = engine.init(List.of("player1", "player2", "player3"));

// 3. When a player sends an action over WebSocket:
try {
    engine.validate(action, state);           // throws if illegal
    state = engine.apply(action, state);      // returns NEW state
} catch (GameEngine.GameRuleException e) {
    // send error back to the player
    sendError(action.getPlayerId(), e.getMessage());
    return;
}

// 4. Broadcast updated views
Map<String, Object> publicView = projector.toPublicView(state);
broadcastToAll(publicView);

for (String pid : state.getPlayerIds()) {
    Map<String, Object> privateView = projector.toPrivateView(state, pid);
    sendToPlayer(pid, privateView);
}

// 5. Check for game end
if (engine.isFinished(state)) {
    String winner = engine.getWinner(state);
    broadcastGameOver(winner);
}
