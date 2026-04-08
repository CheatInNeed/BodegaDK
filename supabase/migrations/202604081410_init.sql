create schema if not exists public;

create extension if not exists pgcrypto with schema extensions;

create table public.games (
    id uuid not null default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    description text,
    title text,
    constraint games_pkey primary key (id)
);

create table public.invite (
    id bigint generated always as identity not null,
    created_at timestamp with time zone not null,
    constraint invite_pkey primary key (id)
);

create table public.profiles (
    id uuid not null default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    username text unique,
    country text,
    constraint profiles_pkey primary key (id),
    constraint profiles_id_fkey foreign key (id) references auth.users(id)
);

create table public.avatars (
    id uuid not null default gen_random_uuid(),
    user_id uuid unique,
    avatar_color text,
    avatar_shape text,
    created_at timestamp with time zone default now(),
    constraint avatars_pkey primary key (id),
    constraint avatars_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table public.leaderboard_scores (
    id uuid not null default gen_random_uuid(),
    user_id uuid,
    username text not null,
    score integer not null default 0,
    season integer default 1,
    created_at timestamp with time zone default now(),
    constraint leaderboard_scores_pkey primary key (id),
    constraint leaderboard_scores_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table public.game_stats (
    user_id uuid not null default gen_random_uuid(),
    created_at timestamp with time zone not null default now(),
    high_score bigint default 0,
    last_played timestamp with time zone,
    game_id uuid not null default gen_random_uuid(),
    constraint game_stats_pkey primary key (user_id, game_id),
    constraint game_stats_game_id_fkey foreign key (game_id) references public.games(id)
);
