create table if not exists public.friend_requests (
    request_id uuid primary key,
    sender_user_id text not null,
    sender_username text,
    recipient_user_id text not null,
    request_status text not null check (request_status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create index if not exists friend_requests_recipient_status_idx
    on public.friend_requests (recipient_user_id, request_status, created_at desc);

create index if not exists friend_requests_sender_status_idx
    on public.friend_requests (sender_user_id, request_status, created_at desc);

drop trigger if exists friend_requests_touch_updated_at on public.friend_requests;
create trigger friend_requests_touch_updated_at
before update on public.friend_requests
for each row
execute function public.touch_updated_at();
