# RLS Audit

Last updated: 2026-05-04

This document records the intended Supabase browser access model for the V1
schema. Spring remains the trusted backend for game rules, room lifecycle,
matchmaking decisions, social mutations, notifications, and result writes.

## Access Principles

- Browser direct Supabase access must use the anon key plus an authenticated
  Supabase user session.
- Row-level security decides row scope, but table/function grants decide
  whether the browser role can use the object at all.
- Browser grants should be narrow and match actual web-client calls.
- Spring JDBC uses privileged backend credentials and is responsible for
  authoritative writes.
- Social APIs, notifications, stats, history, leaderboard reads, and room
  mutations should go through Spring REST unless this document is updated.

## Browser Direct Access Matrix

| Object | Browser access | RLS/policy shape | Reason |
|---|---:|---|---|
| `public.profiles` | `select`, `insert`, `update` for `authenticated` | own row only | Signup/profile bootstrap and auth metadata backfill |
| `public.avatar_defs` | `select` for `authenticated` | active rows only | Avatar picker and profile avatar rendering |
| `public.user_avatars` | `select`, `insert`, `update` for `authenticated` | own row only | Avatar customization |
| `public.games` | `select` for `authenticated` | active rows only | Client catalog reads where needed |
| `public.matchmaking_tickets` | `select` for `authenticated` | own rows only | Quick-play ticket polling/realtime refresh |
| `public.cancel_matchmaking_ticket(uuid, text)` | `execute` for `authenticated` | checks `auth.uid()` and session token | Compatibility/maintenance cancellation path |
| `public.touch_room_presence(text)` | `execute` for `authenticated` | checks active room participation | Lobby/game room participant presence |
| `public.touch_room_heartbeat(text)` | `execute` for `authenticated` | wrapper around room presence | Backward-compatible active room heartbeat |

## Spring-Only Tables

The browser roles should not receive direct table grants for these objects:

- `public.rooms`
- `public.room_players`
- `public.matches`
- `public.match_players`
- `public.friendships`
- `public.user_game_stats`
- `public.leaderboard_scores`
- `public.challenges`
- `public.notifications`

These tables still have RLS policies as defense in depth, but V1 product
traffic should use Spring REST/JDBC instead of direct browser table access.

## Function Lockdown

The browser roles should not execute these helper/backend functions directly:

- `public.finish_stale_rooms(interval)`: service role only
- `public.cleanup_stale_room_presence(interval, interval, interval, interval)`: service role only
- `public.resolve_profile_username(text, uuid)`: internal trigger/helper only
- `public.handle_new_user_profile()`: trigger only
- `public.resolve_game_id(text)`: backend/database helper only

The hardening migration revokes default function execution from `public`,
`anon`, and `authenticated`, then grants back only the intended RPCs.

## Current Hardening Migration

- `supabase/migrations/202604291123_grant_browser_profile_avatar_access.sql`
- `supabase/migrations/202605041200_room_presence_cleanup.sql`

The migration intentionally:

- grants schema usage to `authenticated`
- revokes all app-table access from `anon` and `authenticated`
- grants back only intentional browser tables
- revokes broad RPC/function execution defaults
- grants back only the intended authenticated RPCs
- grants stale room/player/ticket cleanup only to `service_role`

## Deployment Checks

After applying migrations, verify from a signed-in browser:

- Profile page can read `profiles.username` and `profiles.country`.
- Avatar lookup can read `user_avatars` joined to active `avatar_defs`.
- Profile/avatar writes are limited to the current user.
- Friend/challenge/notification UI still works through `/api/*`, not direct
  Supabase table calls.
- Quick-play ticket updates still work for the current user's ticket.

Useful SQL spot checks:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```
