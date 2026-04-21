create or replace function public.resolve_profile_username(
    preferred_username text,
    profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    base_username text := nullif(trim(coalesce(preferred_username, '')), '');
    id_suffix text := left(replace(profile_id::text, '-', ''), 8);
    candidate_username text;
    suffix_counter integer := 0;
begin
    if base_username is null then
        return null;
    end if;

    if not exists (
        select 1
        from public.profiles
        where username = base_username
            and id <> profile_id
    ) then
        return base_username;
    end if;

    candidate_username := base_username || '-' || id_suffix;

    while exists (
        select 1
        from public.profiles
        where username = candidate_username
            and id <> profile_id
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
    insert into public.profiles (id, username, country)
    values (
        new.id,
        public.resolve_profile_username(new.raw_user_meta_data ->> 'username', new.id),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'country', '')), '')
    )
    on conflict (id) do update
    set
        username = coalesce(
            public.resolve_profile_username(excluded.username, public.profiles.id),
            public.profiles.username
        ),
        country = coalesce(excluded.country, public.profiles.country);

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

with profile_backfill_candidates as (
    select
        users.id,
        nullif(trim(coalesce(users.raw_user_meta_data ->> 'username', '')), '') as requested_username,
        nullif(trim(coalesce(users.raw_user_meta_data ->> 'country', '')), '') as country
    from auth.users as users
    left join public.profiles as profiles
        on profiles.id = users.id
    where profiles.id is null
),
ranked_profile_backfill_candidates as (
    select
        id,
        requested_username,
        country,
        row_number() over (
            partition by requested_username
            order by id
        ) as username_rank
    from profile_backfill_candidates
)
insert into public.profiles (id, username, country)
select
    id,
    public.resolve_profile_username(
        case
            when requested_username is null then null
            when username_rank = 1 then requested_username
            else requested_username || '-' || left(replace(id::text, '-', ''), 8)
        end,
        id
    ),
    country
from ranked_profile_backfill_candidates
on conflict do nothing;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
