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

## What Breaks Until Code Is Updated

### Backend

- `JdbcRoomMetadataStore` currently writes old columns: `rooms.room_code` as primary key, `game_type`, `host_player_id`, `room_status`, `is_private`, `room_players.player_id`, `matchmaking_tickets.ticket_id`, `session_token`, and `ticket_status`. It must be rewritten for UUID `rooms.id`, `games.id`, `auth.users` UUIDs, `status`, `visibility`, `client_session_id`, and `matched_room_id`.
- `RoomMetadataStore` and matchmaking DTOs still model player identity as arbitrary strings. They need to treat the authenticated Supabase user UUID as the persisted `user_id`.
- `MatchmakingService` currently accepts `gameType`, `playerId`, `username`, and generated session tokens. It must resolve `gameType` to `games.slug`/`games.id`, require an authenticated user, and return payloads compatible with the new ticket/room IDs.
- `RoomController` normal create/join/list flows still use `InMemoryRuntimeStore` directly. Those flows will not create durable `rooms` or `room_players` rows until moved to the canonical DB path.
- `GameWsHandler` and `InMemoryRuntimeStore.resolveConnect` still validate room access through room code plus runtime tokens. WebSocket connect should be tied to authenticated users and persisted room participation.
- `LobbyCoordinator` and selected-game changes currently mutate runtime room state. Durable rooms should update `rooms.game_id` when the selected game changes.
- Engine adapters can keep user IDs as strings internally, but those strings must become auth UUID strings for persisted players.
- Game completion currently broadcasts `GAME_FINISHED` only. It must write `matches`, `match_players`, and any derived `user_game_stats` or `leaderboard_scores`.
- Backend tests that assert old room/matchmaking persistence columns must be rewritten around the V1 schema.

### Frontend

- Guest fallbacks must be removed from create room, join room, quick play, room reconnect, and WebSocket connect flows.
- API protocol types in `apps/web/src/net/api.ts` and related callers still expect fields such as `playerId`, `token`, `selectedGame`, `ticketId`, and `roomCode`. They need an auth-user-based contract.
- Quick play realtime currently watches old `matchmaking_tickets` field names. It must watch `id`, `status`, `matched_room_id`, `client_session_id`, and any server-returned room code mapping.
- `cancel_matchmaking_ticket(uuid, text)` can keep the same RPC signature for now, but the second argument now means `client_session_id`.
- `touch_room_heartbeat(text)` can keep the same RPC signature, but it now requires the signed-in user to be a persisted room participant.
- Profile code must move from `profiles.id` to `profiles.user_id`.
- Avatar code must move from the old `avatars` table with `avatar_color`/`avatar_shape` to `user_avatars` plus `avatar_defs`.
- UI routes that expose profile, stats, friends, invite, or leaderboard data must remain placeholder/disabled until the matching backend/RLS-safe query path is complete.

### Supabase And Data

- This reset deletes old BodegaDK-owned public app data: profiles, avatars, rooms, tickets, match/game stats, friendships, challenges, notifications, and leaderboard rows.
- Existing auth users remain because `auth.users` is Supabase-managed and is not dropped.
- Existing profile rows are not migrated; profiles are recreated from `auth.users.raw_user_meta_data`.
- No `games` rows are inserted by the reset itself. The game catalog seed migration must run before DB-backed rooms/matchmaking can create rows.
- RLS policies are intentionally minimal. Before exposing new social/history features directly to the browser, add feature-specific policies and tests.

### Deployment

- The migration is destructive and incompatible with the current room/matchmaking backend code.
- Because Supabase migrations may run automatically from GitHub on push, do not push this reset to `dev` until the compatible backend/frontend code is ready or the deployment order is deliberately controlled.
- The correct production shape is one coordinated release: compatible code plus this schema reset plus real game catalog rows.

## Pre-Run Checklist

- Rewrite `JdbcRoomMetadataStore` and related tests for V1 table/column names.
- Require authenticated user identity in room, matchmaking, and WebSocket flows.
- Remove guest identity/session-token behavior from frontend and backend contracts.
- Apply the real `games` catalog seed migration.
- Add game result persistence into `matches` and `match_players`.
- Update profile/avatar queries for `profiles.user_id`, `user_avatars`, and `avatar_defs`.
- Confirm RLS policies for any direct browser reads/writes used by the frontend.
- Run server tests and web build.
- Apply the migration only in a coordinated deploy window.
