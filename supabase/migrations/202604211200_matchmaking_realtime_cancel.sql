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
    set ticket_status = 'CANCELLED'
    where ticket_id = ticket_id_input
      and session_token = session_token_input
      and ticket_status = 'WAITING';

    get diagnostics affected_count = row_count;
    return affected_count > 0;
end;
$$;

grant execute on function public.cancel_matchmaking_ticket(uuid, text) to anon, authenticated;
