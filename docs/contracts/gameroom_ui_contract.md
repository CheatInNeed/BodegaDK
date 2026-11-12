# GameRoom UI Contract

## Purpose

This document defines the UI contract for BodegaDK game rooms in the live
play phase. A game room is the active in-game screen shown after players
have left the lobby and are currently playing the selected game.

This contract is UI-focused. It does not own rule logic, protocol rules,
or backend authority.

## Core principles

- The server remains authoritative for rules, turn flow, RNG, and win
  conditions.
- The client game room only renders public/private state and sends player
  intents.
- All card games share the `GameTable.vue` component as a centralized,
  immersive felt-table layout.
- Games customize only their unique content via named slots — they never
  reinvent the full room structure.
- A single set of CSS custom properties (`--gt-*`) controls the visual
  theme across all game rooms.
- All game room copy lives under `room.*` keys in `src/locales/{da,en}.json`.
  Components use `useI18n().t`; adapters import `t` from `src/i18n.ts`.
  `useGameSession` rebuilds the view model on locale change so
  adapter-produced text follows the language setting live. Server error
  messages are shown untranslated.

## Minimal UI principles

The table should look like a card table, not a dashboard. HighCard
(`HighCardGame.vue`) is the reference room that follows these principles;
the other rooms have not been cleaned up yet (see the checklist below).

1. **Don't label what is visible.** Cards, piles and seats explain
   themselves. No "Middle card", "Your hand (7 cards)" or "Selected: …".
2. **State in short pills, not sentences.** Keep only state the player
   needs and can't see on the table (e.g. the HighCard score). Lobby info
   (room code, game name) does not belong in the room.
3. **No instructions on the table.** Selection and hover show what to do.
   Rules belong on the Help page.
4. **Narration goes to the side panel.** "What just happened" (last round,
   who won the trick, claims) goes to the History tab; system events (joins,
   leaves, connection) go to Chat. The table shows current state only.
5. **Quiet always-on signals.** Connection status is the topbar pill with a
   coloured dot, not a banner.
6. **One turn signal.** The "Din tur" pill beside the actions
   (`isMyTurn` on `GameTable`). No extra "Current turn" tags or
   turn sentences.
7. **Short verb buttons beside the hand**, never above it. Avoid counts and
   explanations in button labels.
8. **No decorative flair.** Plain card faces, solid backs, no ornaments.
   Use the shared renderers in `game-cards.ts` and the `--gt-*` tokens.
   No inline styles for new UI; add `.gt-*` or game classes in `styles.css`.
9. **No hardcoded copy.** Every visible string is a `room.*` i18n key.
10. **The test for every piece of text:** would a player miss it if it were
    gone? If not, remove it.

### Before / after: HighCard

| Removed | Why |
|---|---|
| "Room: …" and "Game: Single Card Highest Wins" pills | Lobby info, not game state |
| "Middle card" | The card is visible |
| "Play a card with a higher value." | Rules belong in Help |
| "Last round: … vs …" | Narration — moved to the History tab |
| "Current turn" seat tag | One turn signal (the "Din tur" pill) |
| "Your hand (7 cards)" | The hand is visible |
| "Selected: …" pill | Selection is shown on the card |
| "Play selected card" | Shortened to "Spil kort" |

Kept: the score pill ("Score: Dig 3 - 1 Giver"), because the score is not
visible anywhere else.

### Cleanup checklist for the remaining rooms

Candidates found when HighCard was done. Check each one against the
principles above before removing it; keep what a player would miss.

**Krig** (`KrigGame.vue`)
- Topbar score labels repeat names and pile counts already shown in the
  player zones (`room.cards`) — keep the score bar, drop the labels or the
  zone counts.
- "{count} kort i potten" (`room.krig.pot`) — the pot is visible as a pile.
- "Vinder af krigen!" overlay subtitle, "+{count} kort" callouts — consider
  moving to History (trick/war events already exist there).
- Status sentences built in `krig/adapter.ts` (`room.krig.status.*`,
  `room.krig.ready`, `room.krig.drawPile`, `room.krig.waitingForOpponent`)
  — check whether they still reach the screen; narration belongs in
  History, and unused keys can go.

**Snyd** (`SnydGame.vue`)
- "{name} meldte {count} × {rank}" in the centre (`lastClaimText`) and
  seat callouts — the current claim is game state and can stay as a short
  pill; earlier claims belong in History (Snyd history is not built yet).
- "Meldt rang" label on the rank input; "Spil valgte ({count})" — shorten
  to a verb.
- "Ingen kort" empty-hand text with inline styles.
- Check that opponents render: the template reads `viewModel.seats`, the
  adapter only provides `players`.

**Casino** (`CasinoGame.vue`)
- "Kort tilbage: {count}" — could be a deck pile with a count instead of a
  sentence.
- "LÅST" / "ÅBEN" and "I alt: {total}" on every table stack — keep only
  what the player can't see (e.g. a lock icon, the build total).
- "Taget: {count}" under each player; "Tag / Læg", "Byg stak" buttons.
- Inline styles in the stack renderer.

**500** (`FemHundredeGame.vue`)
- Points shown in several places (score bar, badges, "/ 500 pt",
  per-meld points) — keep one.
- "Bunke" / "Aflagning" pile labels and "tom" — the piles are visible.
- "Klik på et stik for at tilføje dit valgte kort" — instruction text.
- Hover labels "Træk" / "Tag kort" on the piles duplicate the action
  buttons; up to six action buttons with long labels ("Træk fra bunke",
  "Tag hele bunken", "Læg stik ({count} kort)").
- Opponent "Tur" indicator — a second turn signal next to "Din tur".
- Heavy inline styling in the HTML generators.

## Architecture

### GameTable.vue

`apps/web/src/components/game-room/GameTable.vue`

The single shared layout component wrapping every game. It provides:

- Full-viewport immersive felt background (nordisk green-felt theme)
- Leave button with confirmation dialog
- Connection status pill
- `handTrayOpen` ref via Vue `provide()`

Props:
- `state: RoomSessionState` — connection, errors, winner
- `layout: 'duel' | 'ring'` — table layout mode
- `gameTitle: string` — displayed in leave confirmation
- `isMyTurn?: boolean` — turn-based games only (Snyd, Casino, 500). When set, a "Din tur" pill is shown above the action buttons (beside the hand) while it is the player's turn; its row keeps its height so the layout doesn't shift. Omit for games without turns (HighCard, Krig).
- `historyEntries?: GameLogEntry[]` — entries for the side panel's history tab. HighCard and Krig map `publicState.history` (server-side, see PROTOCOL.md) into these via `lib/game-room/history.ts`; Snyd, Casino and 500 don't supply any yet.

### Side panel (`GameSidePanel.vue`)

Rendered by `GameTable` for every game, inside `.gt-body` (everything below the topbar).

- Slides in over the table from the right (300px; full width under 600px); the table layout is never resized.
- Toggled by a tab fixed to the right edge, vertically centered (`◀` closed, `▶` open). Starts closed; open state and active tab are remembered per browser via `localStorage`.
- Two tabs: **Chat** (`ChatMessage`, left, default) and **History** (game moves, `GameLogEntry`).
- Chat is UI-only: the input is disabled ("coming soon") until a chat backend exists. System lines (player joined/left, connection lost/restored, errors) are derived client-side by `useSystemMessages` and shown in the chat tab; they store an i18n key so they follow language switches.
- The toggle shows an unread badge counting chat lines that arrived while the panel was closed. History entries do not raise the badge.
- Sits above the win overlay so history stays readable after the game ends.

### Named slots

Every game fills these slots to customize its UI:

| Slot | Purpose | Required |
|------|---------|----------|
| `#topbar` | Score bars, round pills, game-specific header content | Yes |
| `#opponents` | Opponent zones (badges, melds, hidden hands) | Yes |
| `#center` | Central board (battle cards, draw/discard piles, claims) | Yes |
| `#self-display` | Self player zone (melds, pips, score) | No |
| `#actions` | Action buttons (Flip, Play, Draw, Call Snyd) | No |
| `#hand` | Hand tray with selectable cards | No |
| `#overlay` | Post-game overlay (WinOverlay) | No |

### Shared sub-components

- `PlayerBadge.vue` — player name, turn indicator, score display
- `CardStack.vue` — themed card pile with count label
- `WinOverlay.vue` — post-game winner display with rematch action

### Card rendering

All card rendering is consolidated in:

`apps/web/src/lib/games/shared/game-cards.ts`

Exports:
- `parseCardCode(code)` — unified parser with joker support
- `renderCardFront(code, cw, ch)` — face-up card SVG
- `renderCardBack(cw, ch, uid)` — face-down card SVG
- `renderHandFan(cards, selected, interactive, faceUp, cw, ch)` — arc-fanned hand
- `renderCardStack(count, cw, ch, uid)` — stacked face-down cards
- `renderEmptySlot(cw, ch)` — empty card placeholder

Uses the nordisk theme exclusively (`THEME` export).

### CSS theming

All game table styles use CSS custom properties defined in `styles.css`:

```css
--gt-felt-center, --gt-felt-mid, --gt-felt-edge
--gt-gold, --gt-gold-bright, --gt-gold-dark
--gt-text-primary, --gt-text-muted
--gt-border-subtle, --gt-border-accent
--gt-font-display
--gt-overlay-bg, --gt-topbar-bg
```

Shared CSS classes prefixed with `.gt-*` (e.g., `.gt-root`, `.gt-table`,
`.gt-topbar`, `.gt-btn`, `.gt-player-badge`, `.gt-connection-pill`).

## Stable room zones

Every active card game room is composed from these zones:

1. **Root** — Full-viewport immersive frame with dark felt background
2. **Topbar** — Leave button, game-specific pills, connection status
3. **Opponents** — Opponent zones (duel: single row top; ring: positioned seats)
4. **Center** — Game-specific focal content (battle cards, piles, claims)
5. **Self zone** — Current player display (melds, score)
6. **Bottom** — One row: the current player's hand fan centred, with the
   "Din tur" pill and the `#actions` buttons stacked beside it on the right.
   Buttons never sit above the hand, because hovered cards pop up over that
   space. The fan narrows (`--fan-max`) to leave room for the buttons; at
   ≤760px (phones, no hover pop) the pill and buttons move above the hand.
7. **Overlay** — Post-game winner display

## Shared layout rules

- Supported live card-room sizes are 2 through 8 players by default.
- The current player should be anchored to the bottom seat whenever the
  room includes a local self player.
- Seat placement must come from shared seat presets or the shared seating
  engine (`arrangeSeats()` in `ui.ts`), not from bespoke per-game CSS.
- The default layout modes are:
  - `duel` — for 2-player or head-to-head focused games
  - `ring` — for multiplayer round-table card games
- Responsive behavior must preserve:
  - a readable center board
  - visible current-player tray/actions
  - recognizable opponent seating

## Shared card rendering rules

- Visible cards use `renderCardFront()` from `game-cards.ts`.
- Hidden opponent hands use `renderCardBack()` or `renderHandFan()` with
  `faceUp: false`.
- Empty table states use `renderEmptySlot()`.
- Selected cards have a distinct visual state (handled by `renderHandFan()`).
- All rendering uses the nordisk theme automatically.
- Games may vary card size, overlap, and placement, but should not redefine
  the base face/back styling.

## Required UI inputs

Every card game room implementation must provide enough UI data for:

- Game metadata — game id/title, max players, preferred layout mode
- Topbar content — short room/game state pills
- Opponent data — player badges, hidden hand counts, melds
- Center-board data — game-specific focus content
- Self display — melds, score, player badge
- Action state — enabled/disabled action controls
- Hand data — current hand cards with selection state
- Post-game — winner label, scores, rematch action

## Game-specific extension points

Games customize only the parts that are unique:

- Center-board content (via `#center` slot)
- Action controls (via `#actions` slot)
- Opponent presentation (via `#opponents` slot)
- Self display content (via `#self-display` slot)
- Topbar pills and score bars (via `#topbar` slot)
- Post-game overlay content (via `#overlay` slot)

Games should not replace the GameTable component or override `.gt-*`
styles unless the game genuinely cannot fit the shared model.

## Non-goals

- No rule validation in the UI contract
- No ownership of WebSocket or REST protocol schemas
- No fake support for unsupported room states
- No requirement that non-card games reuse this exact contract

## Implementation reference

The runtime/session architecture lives in:

- `docs/design/WEB_CLIENT_GAME_ROOM.md`

Key files:

| File | Role |
|------|------|
| `apps/web/src/components/game-room/GameTable.vue` | Shared layout component |
| `apps/web/src/components/game-room/PlayerBadge.vue` | Player display component |
| `apps/web/src/components/game-room/WinOverlay.vue` | Post-game overlay |
| `apps/web/src/lib/games/shared/game-cards.ts` | Consolidated card rendering |
| `apps/web/src/lib/game-room/ui.ts` | Seat arrangement utilities |
| `apps/web/src/lib/game-room/types.ts` | Shared type definitions |
| `apps/web/src/pages/GameRoomPage.vue` | Page orchestration |
| `apps/web/public/styles.css` | CSS custom properties and `.gt-*` classes |

This contract is the source of truth for how live game-room UI should be
composed and extended.
