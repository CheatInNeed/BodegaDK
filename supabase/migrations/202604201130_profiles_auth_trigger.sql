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
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), ''),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'country', '')), '')
    )
    on conflict (id) do update
    set
        username = coalesce(excluded.username, public.profiles.username),
        country = coalesce(excluded.country, public.profiles.country);

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

insert into public.profiles (id, username, country)
select
    users.id,
    nullif(trim(coalesce(users.raw_user_meta_data ->> 'username', '')), ''),
    nullif(trim(coalesce(users.raw_user_meta_data ->> 'country', '')), '')
from auth.users as users
left join public.profiles as profiles
    on profiles.id = users.id
where profiles.id is null;

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
