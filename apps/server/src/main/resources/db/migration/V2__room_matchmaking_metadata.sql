create table if not exists public.rooms (
    room_code text primary key,
    host_player_id text,
    game_type text not null,
    room_status text not null check (room_status in ('LOBBY', 'IN_GAME')),
    is_private boolean not null default false,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table if not exists public.room_players (
    room_code text not null references public.rooms(room_code) on delete cascade,
    player_id text not null,
    username text,
    joined_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    primary key (room_code, player_id)
);

create table if not exists public.matchmaking_tickets (
    ticket_id uuid primary key,
    game_type text not null,
    player_id text not null,
    username text,
    session_token text not null,
    ticket_status text not null check (ticket_status in ('WAITING', 'MATCHED', 'CANCELLED')),
    room_code text references public.rooms(room_code) on delete set null,
    min_players integer not null,
    max_players integer,
    strict_count boolean not null default true,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create index if not exists rooms_visibility_status_idx
    on public.rooms (is_private, room_status, game_type);

create index if not exists room_players_room_code_idx
    on public.room_players (room_code);

create index if not exists matchmaking_tickets_waiting_idx
    on public.matchmaking_tickets (game_type, ticket_status, created_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at
before update on public.rooms
for each row
execute function public.touch_updated_at();

drop trigger if exists room_players_touch_updated_at on public.room_players;
create trigger room_players_touch_updated_at
before update on public.room_players
for each row
execute function public.touch_updated_at();

drop trigger if exists matchmaking_tickets_touch_updated_at on public.matchmaking_tickets;
create trigger matchmaking_tickets_touch_updated_at
before update on public.matchmaking_tickets
for each row
execute function public.touch_updated_at();
