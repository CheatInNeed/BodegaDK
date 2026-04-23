# Room And Matchmaking Architecture

This document describes the current BodegaDK implementation for the
shared room lifecycle that powers both:

- quick play / matchmaking
- private and public lobbies

The key design rule is that game engines do not decide whether a session
is a lobby or a live match. The room owns that lifecycle through a room
status field.

## Lifecycle Model

Every realtime session is represented by one room with:

- a `game_type`
- a `room_status`
- a visibility flag
- a participant list

Current room statuses:

- `LOBBY`
- `IN_GAME`

Two product flows reuse the same room model:

### Private Lobby

1. Client creates a room with `room_status = LOBBY`
2. Players join by code or from the public room browser
3. Host chooses the game if needed
4. Host sends `START_GAME`
5. Backend marks the room `IN_GAME`
6. Engine initializes game state lazily
7. Clients transition from lobby view to room view

### Quick Play

1. Client joins the matchmaking queue for a game
2. Backend collects enough waiting tickets for that game's player rules
3. Backend creates a room in `LOBBY`
4. Backend attaches matched players to the room
5. Backend immediately runs the same `START_GAME` lifecycle
6. Room becomes `IN_GAME`
7. Client polls ticket status and navigates directly to the room view

Quick play is therefore not a separate engine path. It is an automated
room-start flow.

## Database Schema

Room metadata is persisted in Supabase / Postgres.

Migration:

- `supabase/migrations/202604191100_room_matchmaking.sql`

Tables:

### `public.rooms`

Stores room-level lifecycle and visibility metadata.

Columns:

- `room_code` primary key
- `host_player_id`
- `game_type`
- `room_status`
- `is_private`
- `created_at`
- `updated_at`

### `public.room_players`

Stores the participant list for each room.

Columns:

- `room_code` foreign key to `public.rooms`
- `player_id`
- `username`
- `joined_at`
- `updated_at`

### `public.matchmaking_tickets`

Stores quick-play queue entries.

Columns:

- `ticket_id`
- `game_type`
- `player_id`
- `username`
- `session_token`
- `ticket_status`
- `room_code`
- `min_players`
- `max_players`
- `strict_count`
- `created_at`
- `updated_at`

## Persistence Split

Current persistence boundaries:

- room metadata is persisted in SQL
- room participants are persisted in SQL
- matchmaking tickets are persisted in SQL
- WebSocket connection bindings remain in memory
- live engine board state remains in memory for now

This means room recovery is stronger than before, while active match
engine snapshots still behave like transient runtime state.

## Backend Components

### `RoomMetadataStore`

Abstraction over room and matchmaking persistence.

Implementations:

- `JdbcRoomMetadataStore`
- `InMemoryRoomMetadataStore`

The JDBC version is used when Spring has a datasource. The in-memory
fallback keeps the local profile working when JDBC is disabled.

### `InMemoryRuntimeStore`

Still owns:

- session token tracking
- heartbeats
- room executor queues
- live engine state maps

But room metadata operations now delegate through `RoomMetadataStore`.

### `GameCatalogService`

Defines:

- min player counts
- max player counts
- strict versus threshold queue matching
- whether quick play is enabled
- whether realtime engine support exists

This allows matchmaking behavior to vary by game:

- exact player count games such as `casino` and `krig`
- threshold-based games such as future poker-style tables
- instant single-player quick start for `highcard`

### `MatchmakingService`

Responsibilities:

- enqueue quick-play tickets
- inspect waiting tickets per game
- compute whether enough players are available
- atomically create a room
- attach matched players
- trigger `START_GAME`
- mark tickets as `MATCHED`

## Engine Contract

All realtime engines should follow the same pattern:

1. If the room status is `LOBBY`, snapshot methods return lobby-shaped
   room metadata rather than a live board.
2. `SELECT_GAME` is handled by the centralized lobby coordinator, not by
   engine adapters.
3. `START_GAME` is the only place where engine state is initialized.
4. In-game actions are rejected while the room is still in `LOBBY`.

This now applies consistently across High Card, Krig, Casino, Snyd, and
Fem. Krig is no longer a special-case lobby transition target; it is just
another `lobbyEnabled` game in the shared coordinator flow.

## Frontend Flow

### Play View

The play screen is now the quick-play entrypoint.

Behavior:

- all primary game actions use `Play`
- supported realtime games enqueue into matchmaking
- queue status is shown in the UI
- the client polls the ticket endpoint
- when the backend marks the ticket `MATCHED`, the client navigates
  straight to `view=room`

### Lobby Browser

The lobby browser is the custom room entrypoint.

Behavior:

- host chooses a game
- host chooses private or public visibility
- public rooms appear in the browser
- public rooms may still be joinable after `IN_GAME` if the game has
  spare capacity
- private rooms reject new participants once already running

## Public vs Private Running Rooms

The visibility rule is:

- private room + `IN_GAME`: no new participants
- public room + `IN_GAME`: new participants allowed if capacity remains

This is useful for games with open seats. For exact-count games such as
Casino and Krig, the room will usually already be full by the time the
match starts, so the rule matters more for future table games.

## Current Limitation

The room and matchmaking metadata are now persisted, but live engine
board state is still in-memory. A future migration can move engine state
and session recovery into durable storage once the room lifecycle API is
stable.
