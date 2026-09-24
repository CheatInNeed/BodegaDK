-- Harden browser-facing Supabase access.
--
-- Spring uses privileged backend database credentials for authoritative
-- game/social/history writes. The browser anon key should only be able to use
-- the small set of RLS-scoped tables/RPCs that the web client intentionally
-- calls directly.

grant usage on schema public to authenticated;

revoke all on
  public.profiles,
  public.avatar_defs,
  public.user_avatars,
  public.games,
  public.matchmaking_tickets,
  public.rooms,
  public.room_players,
  public.matches,
  public.match_players,
  public.friendships,
  public.user_game_stats,
  public.leaderboard_scores,
  public.challenges,
  public.notifications
from anon, authenticated;

grant select, insert, update
on public.profiles
to authenticated;

grant select
on public.avatar_defs
to authenticated;

grant select, insert, update
on public.user_avatars
to authenticated;

grant select
on public.games
to authenticated;

grant select
on public.matchmaking_tickets
to authenticated;

revoke all on function public.cancel_matchmaking_ticket(uuid, text) from public, anon, authenticated;
revoke all on function public.touch_room_heartbeat(text) from public, anon, authenticated;
revoke all on function public.finish_stale_rooms(interval) from public, anon, authenticated;
revoke all on function public.resolve_profile_username(text, uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.resolve_game_id(text) from public, anon, authenticated;

grant execute on function public.cancel_matchmaking_ticket(uuid, text) to authenticated;
grant execute on function public.touch_room_heartbeat(text) to authenticated;
grant execute on function public.finish_stale_rooms(interval) to service_role;
