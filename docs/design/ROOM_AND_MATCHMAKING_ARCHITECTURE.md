# Room And Matchmaking Architecture

This document describes the current BodegaDK implementation for the shared room
lifecycle that powers:

- Quick play and matchmaking
- Private and public lobbies
- Challenge-created private lobbies

The key design rule is that game engines do not decide whether a session is a
lobby or a live match. The room owns that lifecycle through persisted room
metadata, and engines only initialize live game state when `START_GAME` is
accepted.

## Lifecycle Model

Every realtime session is represented by one persisted room with:

- A canonical `game_id`
- A human-facing `room_code`
- A `status`
- A `visibility`
- A host user
- A participant list

Current room statuses:

- `LOBBY`
- `IN_GAME`
- `FINISHED`
- `ABANDONED`

Two primary product flows reuse the same room model.

### Private Or Public Lobby

1. Client creates a room with `status = LOBBY`.
2. Players join by room code or from the public room browser.
3. Host chooses the game if needed.
4. Host sends `START_GAME`.
5. Backend marks the room `IN_GAME`.
6. Engine initializes game state lazily.
7. Clients transition from lobby view to room view.

### Quick Play

1. Client joins the matchmaking queue for a game.
2. Backend collects enough waiting tickets for that game's player rules.
3. Backend creates a room in `LOBBY`.
4. Backend attaches matched players to the room.
5. Backend immediately runs the same `START_GAME` lifecycle.
6. Room becomes `IN_GAME`.
7. Client polls ticket status and navigates directly to the room view.

Quick play is therefore not a separate engine path. It is an automated
room-start flow.

### Direct Challenge

1. User challenges an accepted friend for an active game.
2. Backend creates a pending challenge with an expiry timestamp.
3. Challenged user accepts.
4. Backend creates a private `LOBBY` room.
5. Backend attaches challenger and challenged user as participants.
6. Challenge is marked `ACCEPTED` and the accept response returns room
   navigation data.

Challenge accept intentionally returns a lobby, not an already-started game,
so the normal room flow remains the single place where live gameplay starts.

## Database Schema

Room metadata is persisted in Supabase Postgres through the V1 schema reset
migration:

- `supabase/migrations/202604281500_v1_schema_reset.sql`
- `supabase/migrations/202604281510_seed_game_catalog.sql`
- `supabase/migrations/202604281520_remove_leaderboard_seasons.sql`

### `public.rooms`

Stores room-level lifecycle and visibility metadata.

Important columns:

- `id`
- `room_code`
- `game_id`
- `host_user_id`
- `status`
- `visibility`
- `max_players`
- `selected_game_slug`
- `last_heartbeat`
- `created_at`
- `updated_at`

### `public.room_players`

Stores the participant list for each room.

Important columns:

- `room_id`
- `user_id`
- `username_snapshot`
- `status`
- `joined_at`
- `updated_at`

### `public.matchmaking_tickets`

Stores quick-play queue entries.

Important columns:

- `id`
- `game_id`
- `user_id`
- `client_session_id`
- `username_snapshot`
- `status`
- `matched_room_id`
- `min_players`
- `max_players`
- `strict_count`
- `created_at`
- `updated_at`

## Persistence Split

Current persistence boundaries:

- Room metadata is persisted in SQL.
- Room participants are persisted in SQL.
- Room participant presence is tracked with `room_players.updated_at`, refreshed
  by the browser while a signed-in user is in a lobby or active game room.
- Matchmaking tickets are persisted in SQL.
- Completed matches, match players, profile stats, and leaderboard scores are
  persisted in SQL.
- Friends, challenges, and notifications are persisted in SQL.
- WebSocket connection bindings remain in memory.
- Live engine board state remains in memory for now.

This means room recovery is stronger than before, while active match engine
snapshots still behave like transient runtime state.

Scheduled cleanup marks stale participants as `DISCONNECTED`, marks vacant
stale `LOBBY` rooms as `ABANDONED`, marks stale `IN_GAME` rooms as `FINISHED`,
and expires stale waiting matchmaking tickets. Public lobby listing also
requires at least one fresh `JOINED` or `READY` participant so ghost lobbies do
not stay visible while waiting for cleanup.

## Backend Components

### `RoomMetadataStore`

Abstraction over room and matchmaking persistence.

Implementation:

- `JdbcRoomMetadataStore`

The Spring app uses the JDBC implementation when a datasource is configured.
Deploys must fail instead of silently falling back to a second persistence
model when required Supabase datasource settings are missing.

### `InMemoryRuntimeStore`

Still owns:

- Active socket/runtime binding helpers
- Heartbeats and executor queues
- Live engine state maps

Room metadata operations delegate through `RoomMetadataStore`.

### `GameCatalogService`

Defines:

- Game IDs and aliases
- Min player counts
- Max player counts
- Strict versus threshold queue matching
- Whether quick play is enabled
- Whether lobby switching is enabled
- Whether realtime engine support exists

This allows matchmaking behavior to vary by game:

- Exact player count games such as `casino` and `krig`
- Threshold-based games such as future poker-style tables
- Instant single-player quick start for `highcard`

### `MatchmakingService`

Responsibilities:

- Enqueue quick-play tickets
- Inspect waiting tickets per game
- Compute whether enough players are available
- Atomically create a room
- Attach matched players
- Trigger `START_GAME`
- Mark tickets as `MATCHED`

## Engine Contract

All realtime engines should follow the same pattern:

1. If the room status is `LOBBY`, snapshot methods return lobby-shaped room
   metadata rather than a live board.
2. `SELECT_GAME` is handled by the centralized lobby coordinator, not by
   engine adapters.
3. `START_GAME` is the only place where engine state is initialized.
4. In-game actions are rejected while the room is still in `LOBBY`.

This applies consistently across High Card, Krig, Casino, Snyd, and Fem.

## Frontend Flow

### Play View

The play screen is the quick-play entrypoint.

Behavior:

- Primary game actions use `Play`.
- Supported realtime games enqueue into matchmaking.
- Queue status is shown in the UI.
- The client polls the ticket endpoint.
- When the backend marks the ticket `MATCHED`, the client navigates straight
  to `view=room`.

### Lobby Browser

The lobby browser is the custom room entrypoint.

Behavior:

- Host chooses a game.
- Host chooses private or public visibility.
- Public `LOBBY` rooms appear in the browser.
- Join endpoint accepts participants only while the room is joinable.
- Exact-count games usually fill before they start.

### Profile Challenges

The Profile friends section can send a V1 Snyd challenge to an accepted friend.
Accepted challenge notifications can create and navigate to a private lobby
through the normal room route.

## Current Limitation

Room and matchmaking metadata are persisted, but live engine board state is
still in memory. A future migration can move engine state and session recovery
into durable storage once the room lifecycle API is stable.
