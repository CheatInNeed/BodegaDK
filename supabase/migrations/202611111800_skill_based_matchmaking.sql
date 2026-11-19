-- Skill-based matchmaking and per-game Elo ratings.
-- Durable schema remains owned by Supabase migrations; the Spring backend uses JDBC.

begin;

alter table public.matches
  add column if not exists "mode" text not null default 'UNRANKED';

alter table public.rooms
  add column if not exists "mode" text not null default 'UNRANKED';

alter table public.match_players
  add column if not exists placement integer,
  add column if not exists abandoned boolean not null default false;

alter table public.matchmaking_tickets
  add column if not exists "mode" text not null default 'UNRANKED',
  add column if not exists rating integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_mode_check') then
    alter table public.matches add constraint matches_mode_check
      check ("mode" in ('RANKED', 'UNRANKED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_mode_check') then
    alter table public.rooms add constraint rooms_mode_check
      check ("mode" in ('RANKED', 'UNRANKED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'match_players_placement_check') then
    alter table public.match_players add constraint match_players_placement_check
      check (placement is null or placement > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matchmaking_tickets_mode_check') then
    alter table public.matchmaking_tickets add constraint matchmaking_tickets_mode_check
      check ("mode" in ('RANKED', 'UNRANKED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matchmaking_tickets_rating_check') then
    alter table public.matchmaking_tickets add constraint matchmaking_tickets_rating_check
      check (rating is null or rating >= 0);
  end if;
end
$$;

create unique index if not exists matchmaking_one_waiting_ticket_per_player_idx
  on public.matchmaking_tickets (user_id)
  where status = 'WAITING';

create index if not exists matchmaking_skill_queue_idx
  on public.matchmaking_tickets (game_id, "mode", status, rating, created_at);

create table if not exists public.player_game_ratings (
  player_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  rating integer not null default 1200 check (rating >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  peak_rating integer not null default 1200 check (peak_rating >= 0),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, game_id)
);

create table if not exists public.rating_changes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  rating_before integer not null check (rating_before >= 0),
  rating_after integer not null check (rating_after >= 0),
  delta integer not null,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create unique index if not exists matches_ranked_mode_idx
  on public.matches (id, "mode");

create index if not exists player_game_ratings_leaderboard_idx
  on public.player_game_ratings (game_id, rating desc, player_id);

create index if not exists rating_changes_player_game_idx
  on public.rating_changes (player_id, game_id, created_at desc);

create index if not exists match_players_match_placement_idx
  on public.match_players (match_id, placement);

alter table public.player_game_ratings enable row level security;
alter table public.rating_changes enable row level security;

create policy player_game_ratings_select_own
on public.player_game_ratings
for select
to authenticated
using (auth.uid() = player_id);

create policy rating_changes_select_own
on public.rating_changes
for select
to authenticated
using (auth.uid() = player_id);

commit;
