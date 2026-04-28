# Game Room UI Checklist

Every game room screen must include the following. Check off when implemented.

## Leave button

Every game room needs a "← Forlad" button that lets the player exit.

- Use the shared CSS class `game-room-leave-btn` (defined in `public/styles.css`)
- Wire it to `data-action="leave-table"` for server-authoritative games (already handled in `wireRoomEvents` → `handleLeaveActiveRoom`)
- For standalone/local games (e.g. Krig prototype), use a custom `data-action` that navigates home

| Game     | File                                         | Status |
|----------|----------------------------------------------|--------|
| 500      | `src/games/fem-hundrede/view.ts`             | ✅ `data-action="leave-table"` |
| Krig     | `src/games/krig/game.ts`                     | ✅ navigates home — wire to `leave-table` when server auth is added |
| Snyd     | `src/games/snyd/view.ts`                     | ❌ |
| Casino   | `src/games/casino/view.ts`                   | ❌ |
| Highcard | `src/games/single-card-highest-wins/view.ts` | ❌ (check if room frame already provides one) |

---

## Multi-player layout

Game UIs must render correctly for all supported player counts without hardcoding
assumptions about how many players are in the room.

### 500 (fem-hundrede) — 2–4 players

The UI adapts automatically based on `players.length` from the server:

| Players | Opponents | Layout |
|---------|-----------|--------|
| 2       | 1         | Single opponent, full-width, melds shown in their zone |
| 3       | 2         | Two opponents side-by-side, card fans 42×59 |
| 4       | 3         | Three opponents side-by-side, card fans 36×50 |

CSS classes driving this: `.g500-opponents-1 / -2 / -3` (see `public/styles.css`).

To test a specific player count in dev (Shift+click), change the `players` array
in `makeFemPublicState()` in `src/net/mock-server.ts`. See the comment there.

---

## Making 500 fully playable (TODO)

The adapter and UI are complete. What's still needed:

1. **Mock send() handler** (`src/net/mock-server.ts` ~line 160) — implement turn
   logic so Shift+click sessions can advance past the static snapshot. Priority
   intents: `DRAW_FROM_STOCK`, `DISCARD`, `LAY_MELD`.

2. **Backend field name verification** — confirm that every field in `FemPublicState`
   (`src/games/fem-hundrede/adapter.ts`) matches exactly what the Java server sends.

3. **LEAVE_TABLE intent** — wire the leave button to a proper server message when
   the backend supports graceful player exit.
