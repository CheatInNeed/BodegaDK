# Game Room UI Checklist

Every game room screen must include the following. Check off when implemented.

## Leave button

Every game room needs a "← Forlad" button that lets the player exit.

- Use the shared CSS class `game-room-leave-btn` (defined in `public/styles.css`)
- Wire it to `data-action="leave-table"` for server-authoritative games (already handled in `wireRoomEvents` → `handleLeaveActiveRoom`)
- For standalone/local games, use a custom `data-action` that navigates to home

| Game       | File                                   | Status |
|------------|----------------------------------------|--------|
| 500        | `src/games/fem-hundrede/view.ts`       | ✅     |
| Krig       | `src/games/krig/view.ts`               | ✅ (`leave-table`, server-authoritative room flow) |
| Snyd       | `src/games/snyd/view.ts`               | ❌     |
| Casino     | `src/games/casino/view.ts`             | ❌     |
| Highcard   | `src/games/single-card-highest-wins/view.ts` | ❌ (uses room frame — check if frame provides it) |
