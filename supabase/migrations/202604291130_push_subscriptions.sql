create table if not exists public.push_subscriptions (
    endpoint text primary key,
    p256dh_key text not null,
    auth_key text not null,
    user_id text not null,
    username text,
    device_id text,
    device_label text,
    user_agent text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    revoked_at timestamptz
);

create index if not exists push_subscriptions_active_user_idx
    on public.push_subscriptions (active, user_id, last_seen_at desc);

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_updated_at();
