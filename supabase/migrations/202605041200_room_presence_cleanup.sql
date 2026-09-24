-- Add participant-level room presence and cleanup for ghost lobbies.
--
-- Room heartbeat remains useful for active games, but lobby visibility also
-- needs a fresh participant signal. We use room_players.updated_at as the
-- durable "last seen" timestamp so the existing V1 schema stays compact.

create or replace function public.touch_room_presence(room_code_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  touched_player_count integer;
begin
  update public.room_players
  set
    status = case
      when status = 'DISCONNECTED' then 'JOINED'
      else status
    end,
    updated_at = now()
  where room_id = (
      select id
      from public.rooms
      where room_code = room_code_input
        and status in ('LOBBY', 'IN_GAME')
    )
    and user_id = auth.uid()
    and status in ('JOINED', 'READY', 'DISCONNECTED');

  get diagnostics touched_player_count = row_count;

  if touched_player_count > 0 then
    update public.rooms
    set last_heartbeat = now()
    where room_code = room_code_input
      and status = 'IN_GAME';
  end if;

  return touched_player_count > 0;
end;
$$;

create or replace function public.touch_room_heartbeat(room_code_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.touch_room_presence(room_code_input);
end;
$$;

create or replace function public.cleanup_stale_room_presence(
  participant_stale_after interval default interval '2 minutes',
  lobby_stale_after interval default interval '10 minutes',
  in_game_stale_after interval default interval '60 seconds',
  ticket_stale_after interval default interval '10 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  disconnected_players integer;
  abandoned_lobbies integer;
  finished_rooms integer;
  expired_tickets integer;
begin
  update public.room_players
  set status = 'DISCONNECTED'
  where status in ('JOINED', 'READY')
    and updated_at < now() - participant_stale_after;

  get diagnostics disconnected_players = row_count;

  update public.rooms
  set status = 'ABANDONED'
  where status = 'LOBBY'
    and updated_at < now() - lobby_stale_after
    and not exists (
      select 1
      from public.room_players
      where room_players.room_id = rooms.id
        and room_players.status in ('JOINED', 'READY')
        and room_players.updated_at >= now() - participant_stale_after
    );

  get diagnostics abandoned_lobbies = row_count;

  update public.rooms
  set status = 'FINISHED'
  where status = 'IN_GAME'
    and last_heartbeat < now() - in_game_stale_after;

  get diagnostics finished_rooms = row_count;

  update public.matchmaking_tickets
  set status = 'EXPIRED'
  where status = 'WAITING'
    and updated_at < now() - ticket_stale_after;

  get diagnostics expired_tickets = row_count;

  return jsonb_build_object(
    'disconnectedPlayers', disconnected_players,
    'abandonedLobbies', abandoned_lobbies,
    'finishedRooms', finished_rooms,
    'expiredTickets', expired_tickets
  );
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

revoke all on function public.touch_room_presence(text) from public, anon, authenticated;
revoke all on function public.touch_room_heartbeat(text) from public, anon, authenticated;
revoke all on function public.cleanup_stale_room_presence(interval, interval, interval, interval) from public, anon, authenticated;
revoke all on function public.finish_stale_rooms(interval) from public, anon, authenticated;

grant execute on function public.touch_room_presence(text) to authenticated;
grant execute on function public.touch_room_heartbeat(text) to authenticated;
grant execute on function public.cleanup_stale_room_presence(interval, interval, interval, interval) to service_role;
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
    where jobname in (
      'finish-stale-bodegadk-rooms',
      'cleanup-stale-bodegadk-room-presence'
    );

    perform cron.schedule(
      'cleanup-stale-bodegadk-room-presence',
      '* * * * *',
      $schedule$select public.cleanup_stale_room_presence();$schedule$
    );
  end if;
end;
$$;
