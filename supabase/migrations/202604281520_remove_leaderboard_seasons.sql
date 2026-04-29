begin;

drop index if exists public.leaderboard_game_season_score_idx;
drop index if exists public.leaderboard_game_score_idx;
drop index if exists public.leaderboard_unique_user_game_mode_idx;

update public.leaderboard_scores
set mode = 'standard'
where mode is null;

alter table public.leaderboard_scores
  alter column mode set default 'standard',
  alter column mode set not null,
  drop column if exists season;

with ranked_scores as (
  select
    id,
    row_number() over (
      partition by game_id, user_id, mode
      order by score desc, created_at desc, id
    ) as row_number
  from public.leaderboard_scores
)
delete from public.leaderboard_scores
using ranked_scores
where leaderboard_scores.id = ranked_scores.id
  and ranked_scores.row_number > 1;

create index leaderboard_game_score_idx
on public.leaderboard_scores(game_id, mode, score desc);

create unique index leaderboard_unique_user_game_mode_idx
on public.leaderboard_scores(game_id, user_id, mode);

commit;
