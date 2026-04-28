-- BodegaDK V1 Schema Reset
-- Destructive migration: drops old BodegaDK-owned public tables and recreates the V1 schema.
-- Do NOT drop Supabase-managed schemas/tables such as auth, storage, realtime, extensions,
-- or supabase_migrations.

begin;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Drop old app functions, triggers, and tables
-- ---------------------------------------------------------------------

drop trigger if exists on_auth_user_created_profile on auth.users;

drop function if exists public.cancel_matchmaking_ticket(uuid, text);
drop function if exists public.touch_room_heartbeat(text);
drop function if exists public.finish_stale_rooms(interval);
drop function if exists public.handle_new_user_profile();
drop function if exists public.resolve_profile_username(text, uuid);

drop table if exists public.matchmaking_tickets cascade;
drop table if exists public.room_players cascade;
drop table if exists public.rooms cascade;
drop table if exists public.leaderboard_scores cascade;
drop table if exists public.game_stats cascade;
drop table if exists public.user_game_stats cascade;
drop table if exists public.match_players cascade;
drop table if exists public.matches cascade;
drop table if exists public.friendships cascade;
drop table if exists public.challenges cascade;
drop table if exists public.notifications cascade;
drop table if exists public.user_avatars cascade;
drop table if exists public.avatar_defs cascade;
drop table if exists public.avatars cascade;
drop table if exists public.invite cascade;
drop table if exists public.games cascade;
drop table if exists public.profiles cascade;

-- Legacy Flyway bookkeeping table. Flyway is no longer used.
drop table if exists public.flyway_schema_history cascade;

drop function if exists public.touch_updated_at() cascade;
drop function if exists public.set_updated_at() cascade;

-- ---------------------------------------------------------------------
-- Shared updated_at trigger helper
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Avatar definitions
-- ---------------------------------------------------------------------

create table public.avatar_defs (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  style text,
  shape text,
  asset_url text,
  default_options jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger avatar_defs_set_updated_at
before update on public.avatar_defs
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- User avatars
-- A user has exactly one current avatar in V1.
-- ---------------------------------------------------------------------

create table public.user_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_def_id uuid not null references public.avatar_defs(id),
  color text,
  seed text,
  options jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_avatars_set_updated_at
before update on public.user_avatars
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Games catalog
-- ---------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  min_players int not null default 2 check (min_players > 0),
  max_players int not null default 2 check (max_players >= min_players),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger games_set_updated_at
before update on public.games
for each row
execute function public.set_updated_at();

create or replace function public.resolve_game_id(game_slug text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resolved_id uuid;
begin
  select id
  into resolved_id
  from public.games
  where slug = lower(trim(coalesce(game_slug, 'snyd')))
    and is_active
  limit 1;

  if resolved_id is null then
    raise exception 'Unknown or inactive game slug: %', game_slug;
  end if;

  return resolved_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Rooms
-- Rooms are temporary/live lobby containers.
-- ---------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  game_id uuid not null references public.games(id),
  host_user_id uuid not null references auth.users(id),
  status text not null check (status in ('LOBBY', 'IN_GAME', 'FINISHED', 'ABANDONED')),
  visibility text not null check (visibility in ('PUBLIC', 'PRIVATE', 'FRIENDS_ONLY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_heartbeat timestamptz not null default now()
);

create trigger rooms_set_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Room players
-- Tracks users currently/recently in a room.
-- ---------------------------------------------------------------------

create table public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_index int,
  status text not null check (status in ('JOINED', 'READY', 'LEFT', 'DISCONNECTED', 'KICKED')),
  username_snapshot text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create trigger room_players_set_updated_at
before update on public.room_players
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Matches
-- Matches are permanent game history.
-- ---------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  room_id uuid references public.rooms(id) on delete set null,
  status text not null check (status in ('ACTIVE', 'COMPLETED', 'ABORTED', 'CANCELLED')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  winner_user_id uuid references auth.users(id) on delete set null,
  result_type text check (
    result_type is null or result_type in (
      'WIN',
      'DRAW',
      'TIMEOUT',
      'RESIGNATION',
      'DISCONNECT',
      'ABORTED'
    )
  ),
  ruleset jsonb,
  final_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (ended_at is null or ended_at >= started_at)
);

create trigger matches_set_updated_at
before update on public.matches
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Match players
-- Permanent participant records for each match.
-- ---------------------------------------------------------------------

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_index int,
  side text,
  result text check (
    result is null or result in (
      'WIN',
      'LOSS',
      'DRAW',
      'ABANDONED'
    )
  ),
  score int,
  rating_before int,
  rating_after int,
  rating_delta int,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- ---------------------------------------------------------------------
-- Friendships
-- Social graph edge between two users.
-- ---------------------------------------------------------------------

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  addressee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (requester_user_id, addressee_user_id),
  check (requester_user_id <> addressee_user_id)
);

create trigger friendships_set_updated_at
before update on public.friendships
for each row
execute function public.set_updated_at();

-- Prevent duplicate inverse friendships:
-- A -> B and B -> A should not both exist.
create unique index friendships_unique_pair_idx
on public.friendships (
  least(requester_user_id, addressee_user_id),
  greatest(requester_user_id, addressee_user_id)
);

-- ---------------------------------------------------------------------
-- User game stats
-- Cached summary derived from matches + match_players.
-- ---------------------------------------------------------------------

create table public.user_game_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  games_played int not null default 0 check (games_played >= 0),
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  draws int not null default 0 check (draws >= 0),
  high_score bigint not null default 0,
  current_streak int not null default 0,
  best_streak int not null default 0,
  total_play_time_seconds int not null default 0 check (total_play_time_seconds >= 0),
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create trigger user_game_stats_set_updated_at
before update on public.user_game_stats
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Leaderboard scores
-- Per-game/per-season/per-mode leaderboard entries.
-- ---------------------------------------------------------------------

create table public.leaderboard_scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  score int not null default 0,
  season int not null default 1,
  mode text,
  username_snapshot text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Matchmaking tickets
-- Public queue tickets.
-- ---------------------------------------------------------------------

create table public.matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_session_id text,
  username_snapshot text,
  status text not null check (status in ('WAITING', 'MATCHED', 'CANCELLED', 'EXPIRED')),
  matched_room_id uuid references public.rooms(id) on delete set null,
  min_players int not null check (min_players > 0),
  max_players int check (max_players is null or max_players >= min_players),
  strict_count boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger matchmaking_tickets_set_updated_at
before update on public.matchmaking_tickets
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Challenges
-- Direct user-to-user game invites.
-- ---------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_user_id uuid not null references auth.users(id) on delete cascade,
  challenged_user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id),
  status text not null check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')),
  room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,

  check (challenger_user_id <> challenged_user_id)
);

-- ---------------------------------------------------------------------
-- Notifications
-- User-facing social/game notifications.
-- ---------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type text not null,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

create index profiles_username_idx
on public.profiles(username);

create index avatar_defs_key_idx
on public.avatar_defs(key);

create index user_avatars_avatar_def_idx
on public.user_avatars(avatar_def_id);

create index games_slug_idx
on public.games(slug);

create index rooms_room_code_idx
on public.rooms(room_code);

create index rooms_game_status_idx
on public.rooms(game_id, status);

create index rooms_host_user_idx
on public.rooms(host_user_id);

create index rooms_last_heartbeat_idx
on public.rooms(last_heartbeat);

create index room_players_user_idx
on public.room_players(user_id);

create index room_players_room_idx
on public.room_players(room_id);

create index room_players_status_idx
on public.room_players(status);

create index matches_game_started_idx
on public.matches(game_id, started_at desc);

create index matches_room_idx
on public.matches(room_id);

create index matches_winner_idx
on public.matches(winner_user_id);

create index matches_status_idx
on public.matches(status);

create index match_players_user_created_idx
on public.match_players(user_id, created_at desc);

create index match_players_match_idx
on public.match_players(match_id);

create index friendships_requester_idx
on public.friendships(requester_user_id);

create index friendships_addressee_idx
on public.friendships(addressee_user_id);

create index friendships_status_idx
on public.friendships(status);

create index user_game_stats_user_idx
on public.user_game_stats(user_id);

create index user_game_stats_game_idx
on public.user_game_stats(game_id);

create index leaderboard_game_score_idx
on public.leaderboard_scores(game_id, score desc);

create index leaderboard_game_season_score_idx
on public.leaderboard_scores(game_id, season, score desc);

create index leaderboard_user_idx
on public.leaderboard_scores(user_id);

create index leaderboard_match_idx
on public.leaderboard_scores(match_id);

create index matchmaking_user_status_idx
on public.matchmaking_tickets(user_id, status);

create index matchmaking_game_status_idx
on public.matchmaking_tickets(game_id, status);

create index matchmaking_room_idx
on public.matchmaking_tickets(matched_room_id);

create index matchmaking_created_idx
on public.matchmaking_tickets(created_at);

create index challenges_challenger_idx
on public.challenges(challenger_user_id);

create index challenges_challenged_idx
on public.challenges(challenged_user_id);

create index challenges_status_idx
on public.challenges(status);

create index challenges_room_idx
on public.challenges(room_id);

create index notifications_user_created_idx
on public.notifications(user_id, created_at desc);

create index notifications_user_read_idx
on public.notifications(user_id, read_at);

create index notifications_actor_idx
on public.notifications(actor_user_id);

-- ---------------------------------------------------------------------
-- RLS baseline
-- Backend writes use privileged server credentials. Browser-side direct
-- Supabase access must stay authenticated and scoped to the current user.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.avatar_defs enable row level security;
alter table public.user_avatars enable row level security;
alter table public.games enable row level security;
alter table public.matchmaking_tickets enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.friendships enable row level security;
alter table public.user_game_stats enable row level security;
alter table public.leaderboard_scores enable row level security;
alter table public.challenges enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy avatar_defs_select_active
on public.avatar_defs
for select
to authenticated
using (is_active);

create policy user_avatars_select_own
on public.user_avatars
for select
to authenticated
using (auth.uid() = user_id);

create policy user_avatars_insert_own
on public.user_avatars
for insert
to authenticated
with check (auth.uid() = user_id);

create policy user_avatars_update_own
on public.user_avatars
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy games_select_active
on public.games
for select
to authenticated
using (is_active);

create policy matchmaking_tickets_select_own
on public.matchmaking_tickets
for select
to authenticated
using (auth.uid() = user_id);

create policy rooms_select_participant_or_public
on public.rooms
for select
to authenticated
using (
  visibility = 'PUBLIC'
  or host_user_id = auth.uid()
  or exists (
    select 1
    from public.room_players
    where room_players.room_id = rooms.id
      and room_players.user_id = auth.uid()
  )
);

create policy room_players_select_own
on public.room_players
for select
to authenticated
using (user_id = auth.uid());

create policy matches_select_participant
on public.matches
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players
    where match_players.match_id = matches.id
      and match_players.user_id = auth.uid()
  )
);

create policy match_players_select_own
on public.match_players
for select
to authenticated
using (user_id = auth.uid());

create policy friendships_select_own
on public.friendships
for select
to authenticated
using (
  requester_user_id = auth.uid()
  or addressee_user_id = auth.uid()
);

create policy user_game_stats_select_own
on public.user_game_stats
for select
to authenticated
using (user_id = auth.uid());

create policy leaderboard_scores_select_all
on public.leaderboard_scores
for select
to authenticated
using (true);

create policy challenges_select_own
on public.challenges
for select
to authenticated
using (
  challenger_user_id = auth.uid()
  or challenged_user_id = auth.uid()
);

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Auth profile trigger
-- ---------------------------------------------------------------------

create or replace function public.resolve_profile_username(
  preferred_username text,
  profile_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text := nullif(trim(coalesce(preferred_username, '')), '');
  id_suffix text := left(replace(profile_user_id::text, '-', ''), 8);
  candidate_username text;
  suffix_counter integer := 0;
begin
  if base_username is null then
    base_username := 'user-' || id_suffix;
  end if;

  if not exists (
    select 1
    from public.profiles
    where username = base_username
      and user_id <> profile_user_id
  ) then
    return base_username;
  end if;

  candidate_username := base_username || '-' || id_suffix;

  while exists (
    select 1
    from public.profiles
    where username = candidate_username
      and user_id <> profile_user_id
  ) loop
    suffix_counter := suffix_counter + 1;
    candidate_username := base_username || '-' || id_suffix || '-' || suffix_counter::text;
  end loop;

  return candidate_username;
end;
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, username, display_name, country)
  values (
    new.id,
    public.resolve_profile_username(new.raw_user_meta_data ->> 'username', new.id),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'country', '')), '')
  )
  on conflict (user_id) do update
  set
    username = coalesce(
      public.resolve_profile_username(excluded.username, public.profiles.user_id),
      public.profiles.username
    ),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    country = coalesce(excluded.country, public.profiles.country);

  return new;
end;
$$;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

insert into public.profiles (user_id, username, display_name, country)
select
  users.id,
  public.resolve_profile_username(users.raw_user_meta_data ->> 'username', users.id),
  nullif(trim(coalesce(users.raw_user_meta_data ->> 'display_name', '')), ''),
  nullif(trim(coalesce(users.raw_user_meta_data ->> 'country', '')), '')
from auth.users as users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- App RPC compatibility
-- ---------------------------------------------------------------------

alter table public.matchmaking_tickets replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matchmaking_tickets'
  ) then
    alter publication supabase_realtime add table public.matchmaking_tickets;
  end if;
end $$;

create or replace function public.cancel_matchmaking_ticket(
  ticket_id_input uuid,
  session_token_input text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.matchmaking_tickets
  set status = 'CANCELLED'
  where id = ticket_id_input
    and user_id = auth.uid()
    and client_session_id = session_token_input
    and status = 'WAITING';

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

create or replace function public.touch_room_heartbeat(room_code_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.rooms
  set last_heartbeat = now()
  where room_code = room_code_input
    and status = 'IN_GAME'
    and exists (
      select 1
      from public.room_players
      where room_players.room_id = rooms.id
        and room_players.user_id = auth.uid()
    );

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

create or replace function public.finish_stale_rooms(stale_after interval default interval '60 seconds')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  update public.rooms
  set status = 'FINISHED'
  where status = 'IN_GAME'
    and last_heartbeat < now() - stale_after;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

grant execute on function public.cancel_matchmaking_ticket(uuid, text) to authenticated;
grant execute on function public.touch_room_heartbeat(text) to authenticated;
grant execute on function public.finish_stale_rooms(interval) to service_role;

do $$
begin
  if exists (
    select 1
    from pg_available_extensions
    where name = 'pg_cron'
  ) then
    execute 'create extension if not exists pg_cron with schema extensions';
  end if;

  if exists (
    select 1
    from pg_namespace
    where nspname = 'cron'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'finish-stale-bodegadk-rooms';

    perform cron.schedule(
      'finish-stale-bodegadk-rooms',
      '* * * * *',
      $schedule$select public.finish_stale_rooms(interval '60 seconds');$schedule$
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Seed default avatar definitions
-- Adjust these rows to match the actual app assets/options.
-- ---------------------------------------------------------------------

insert into public.avatar_defs (
  key,
  name,
  style,
  shape,
  asset_url,
  default_options
)
values
  (
    'default_circle',
    'Default Circle',
    'default',
    'circle',
    null,
    '{}'::jsonb
  ),
  (
    'default_square',
    'Default Square',
    'default',
    'square',
    null,
    '{}'::jsonb
  )
on conflict (key) do nothing;

-- Games are intentionally not seeded here. The app must load a real game
-- catalog through a later controlled migration or admin process before rooms
-- or matchmaking can create durable rows.

commit;
