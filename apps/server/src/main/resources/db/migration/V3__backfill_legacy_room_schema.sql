alter table public.rooms
    add column if not exists game_type text,
    add column if not exists room_status text,
    add column if not exists is_private boolean not null default false,
    add column if not exists updated_at timestamp with time zone not null default now();

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'rooms'
          and column_name = 'game_id'
    ) then
        execute 'update public.rooms set game_type = coalesce(game_type, game_id, ''highcard'') where game_type is null';
    else
        update public.rooms set game_type = 'highcard' where game_type is null;
    end if;
end;
$$;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'rooms'
          and column_name = 'status'
    ) then
        execute 'update public.rooms set room_status = coalesce(room_status, case when status = ''IN_GAME'' then ''IN_GAME'' else ''LOBBY'' end) where room_status is null';
    else
        update public.rooms set room_status = 'LOBBY' where room_status is null;
    end if;
end;
$$;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'rooms'
          and column_name = 'is_public'
    ) then
        execute 'update public.rooms set is_private = not is_public';
    end if;
end;
$$;

alter table public.rooms
    alter column game_type set not null,
    alter column room_status set not null,
    alter column is_private set not null;

alter table public.room_players
    add column if not exists username text,
    add column if not exists updated_at timestamp with time zone not null default now();

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'room_players'
          and column_name = 'display_name'
    ) then
        execute 'update public.room_players set username = coalesce(username, display_name) where username is null';
    end if;
end;
$$;
