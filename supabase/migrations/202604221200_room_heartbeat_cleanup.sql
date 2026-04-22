alter table public.rooms
    add column if not exists last_heartbeat timestamp with time zone not null default now();

do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conrelid = 'public.rooms'::regclass
          and conname = 'rooms_room_status_check'
    ) then
        alter table public.rooms drop constraint rooms_room_status_check;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.rooms'::regclass
          and conname = 'rooms_room_status_lifecycle_check'
    ) then
        alter table public.rooms
            add constraint rooms_room_status_lifecycle_check
            check (room_status in ('LOBBY', 'IN_GAME', 'FINISHED'));
    end if;
end;
$$;

create index if not exists rooms_stale_heartbeat_idx
    on public.rooms (last_heartbeat)
    where room_status = 'IN_GAME';

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
      and room_status = 'IN_GAME';

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
    set room_status = 'FINISHED'
    where room_status = 'IN_GAME'
      and last_heartbeat < now() - stale_after;

    get diagnostics affected_count = row_count;
    return affected_count;
end;
$$;

grant execute on function public.touch_room_heartbeat(text) to anon, authenticated;
grant execute on function public.finish_stale_rooms(interval) to anon, authenticated;

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
