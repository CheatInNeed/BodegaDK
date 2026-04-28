# Database V1 Schema Reset

Status: draft implementation plan. Do not run the destructive reset against dev or production until the breakage checklist below has been resolved.

Migration files:

- `supabase/migrations/202604281500_v1_schema_reset.sql`
- `supabase/migrations/202604281510_seed_game_catalog.sql`

## Decisions

- Supabase Postgres is the canonical durable database.
- Supabase migrations are the canonical schema history.
- Flyway is not part of the app schema path anymore. The reset also removes `public.flyway_schema_history` if it exists.
- Guest users are no longer supported for persisted flows. Every durable user reference points at `auth.users(id)`.
- Spring remains the trusted backend for game rules, room transitions, matchmaking decisions, and game result writes.
- The browser may use the Supabase client only for authenticated, RLS-safe reads/writes and realtime subscriptions.
- Rooms are temporary lobby/live containers. Matches are permanent game history.
- `games` is a real catalog table, but the reset migration does not seed game rows. The follow-up seed migration inserts the real catalog rows.
- Avatar definitions are seeded because they are static UI definitions, not gameplay catalog data.

## Schema Shape

- `profiles`: one row per `auth.users` row, keyed by `user_id`.
- `avatar_defs` and `user_avatars`: static avatar definitions plus one current avatar per user.
- `games`: canonical game catalog with stable `slug` and UUID primary key.
- `rooms` and `room_players`: live lobby state persisted by user UUID.
- `matchmaking_tickets`: authenticated queue tickets linked to `games`, `rooms`, and `auth.users`.
- `matches` and `match_players`: permanent game history.
- `user_game_stats` and `leaderboard_scores`: cached/derived game summaries.
- `friendships`, `challenges`, and `notifications`: first-pass social graph and invite surface.

## Compatibility Included In The Migration

- Replaces the old auth profile trigger so new users insert into `profiles.user_id`, not the old `profiles.id`.
- Backfills profiles for existing `auth.users` rows after the reset.
- Recreates `cancel_matchmaking_ticket(uuid, text)` against `matchmaking_tickets.id`, `client_session_id`, and `auth.uid()`.
- Recreates `touch_room_heartbeat(text)` against `rooms.room_code`, `rooms.status`, and authenticated room participation.
- Recreates `finish_stale_rooms(interval)` against the new `rooms.status`.
- Restores realtime publication for `matchmaking_tickets`.
- Enables an initial RLS baseline for authenticated users. Backend writes should still use privileged server credentials.

## Code Update Status

### Backend

- `JdbcRoomMetadataStore` writes the V1 `rooms`, `room_players`, and `matchmaking_tickets` tables.
- Room and matchmaking REST controllers require authenticated Supabase users and persist auth UUIDs as `user_id`.
- Normal room create/join/list flows write/read DB room metadata and only mirror active room state into memory.
- `GameWsHandler` validates Supabase access tokens, checks persisted room membership, and then binds sockets to auth UUIDs.
- `LobbyCoordinator` updates durable selected game state through `rooms.game_id`.
- Matchmaking creates the durable room first, then mirrors room/player state into runtime memory.
- Engine adapters can keep user IDs as strings internally, but those strings must become auth UUID strings for persisted players.
- Game completion writes `matches` and `match_players`; `GET /me/matches` and the profile Recent Games UI now read them. Derived `user_game_stats` and `leaderboard_scores` are still future work.
- Backend tests still need a full compile/run pass on a machine with Maven.

### Frontend

- Guest fallbacks are removed from live room, join, quick play, and WebSocket flows.
- API protocol types no longer expose room/session tokens. `playerId` fields remain as UI-compatible auth UUIDs.
- Quick play realtime watches tickets by V1 `id`.
- Matchmaking cancellation goes through the authenticated server API; direct browser RPC cancellation is no longer used by the app.
- `touch_room_heartbeat(text)` can keep the same RPC signature, but it now requires the signed-in user to be a persisted room participant.
- Profile code uses `profiles.user_id`.
- Avatar code uses `user_avatars` plus `avatar_defs`.
- Profile match history is live through the authenticated backend API. Stats, friends, invite, and leaderboard UI remain placeholder/disabled until their matching backend/RLS-safe query paths are complete.

### Supabase And Data

- This reset deletes old BodegaDK-owned public app data: profiles, avatars, rooms, tickets, match/game stats, friendships, challenges, notifications, and leaderboard rows.
- Existing auth users remain because `auth.users` is Supabase-managed and is not dropped.
- Existing profile rows are not migrated; profiles are recreated from `auth.users.raw_user_meta_data`.
- No `games` rows are inserted by the reset itself. The game catalog seed migration must run before DB-backed rooms/matchmaking can create rows.
- RLS policies are intentionally minimal. Before exposing new social/history features directly to the browser, add feature-specific policies and tests.

### Deployment

- The migration is destructive and must deploy with compatible backend/frontend code.
- Because Supabase migrations may run automatically from GitHub on push, do not push this reset to `dev` until the compatible backend/frontend code is ready or the deployment order is deliberately controlled.
- The correct production shape is one coordinated release: compatible code plus this schema reset plus real game catalog rows.

## Pre-Run Checklist

- Run server tests on a machine with Maven.
- Run at least one authenticated create/join/start/finish flow against Supabase.
- Apply the real `games` catalog seed migration.
- Confirm RLS policies for any direct browser reads/writes used by the frontend.
- Run web build.
- Apply the migration only in a coordinated deploy window.
