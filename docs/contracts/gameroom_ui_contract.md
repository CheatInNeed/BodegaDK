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
- Card games share one common room shell and one common table foundation.
- Games may vary card presentation, center-board content, and controls, but
  should not reinvent the full room structure.

## Stable room zones

Every active card game room is composed from these zones:

1. Shell
   - Outer immersive frame, topbar, connection status, leave action,
     sidebar/log, notices.
2. Header pills
   - Short high-signal room metadata such as room code, round, score, pile,
     turn, or game label.
3. Table surface
   - Shared green-table presentation used as the base play surface.
4. Seats
   - Shared seat positions around the table for players/opponents.
5. Center board
   - Game-specific focal content inside the table surface.
6. Private tray
   - Current player hand area and supporting summary text.
7. Actions
   - Game actions tied to the private tray, such as play/claim/challenge.

## Shared layout rules

- Supported live card-room sizes are 2 through 8 players by default.
- The current player should be anchored to the bottom seat whenever the
  room includes a local self player.
- Seat placement must come from shared seat presets or the shared seating
  engine, not from bespoke per-game CSS alone.
- The default layout modes are:
  - `duel`
    - for 2-player or head-to-head focused games
  - `ring`
    - for multiplayer round-table card games
- Games may override the default preset only when the shared layout cannot
  represent the room clearly.
- Responsive behavior must preserve:
  - a readable center board
  - visible current-player tray/actions
  - recognizable opponent seating

## Shared card rendering rules

- Visible cards should use shared card-face primitives.
- Hidden opponent hands should use shared back/stack primitives.
- Empty or pending table states should use shared empty-slot treatment.
- Selected cards must have a distinct selected state.
- Disabled or non-actionable states must stay visually clear.
- Card primitives inherit active theme tokens automatically.
- Games may vary card size, overlap, and placement, but should not redefine
  the base face/back styling for every game.

## Required UI inputs

Every card game room implementation must provide enough UI data for:

- Game metadata
  - game id/title
  - max players
  - preferred layout mode
- Header summary
  - short room/game state pills
- Seat data
  - player id
  - display label
  - self/current-turn state
  - optional badges/meta
  - hidden-hand count and/or revealed table card
- Center-board data
  - game-specific focus content and status
- Private tray data
  - current hand
  - optional tray summary text
- Action state
  - enabled/disabled action controls
  - any required local input fields

## Game-specific extension points

Games are expected to customize only the parts that are unique:

- center-board content
- action controls
- seat badge content
- per-seat revealed cards vs hidden stacks
- counters/status pills
- tray copy and action composition

Games should not replace the shell, table foundation, or core seat system
unless the room type genuinely cannot fit the shared model.

## Non-goals

- No rule validation in the UI contract
- No ownership of WebSocket or REST protocol schemas
- No fake support for unsupported room states
- No requirement that non-card games reuse this exact contract

## Implementation reference

The runtime/session architecture still lives in:

- `docs/design/WEB_CLIENT_GAME_ROOM.md`

This contract is the source of truth for how live game-room UI should be
composed and extended.
