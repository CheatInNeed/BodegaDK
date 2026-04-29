-- Seed the canonical BodegaDK game catalog used by server room/matchmaking flows.

insert into public.games (
  slug,
  title,
  description,
  min_players,
  max_players,
  is_active
)
values
  (
    'highcard',
    'Highest Card',
    'Single-card highest-wins game.',
    1,
    8,
    true
  ),
  (
    'krig',
    'Krig',
    'Two-player war card game.',
    2,
    2,
    true
  ),
  (
    'casino',
    'Casino',
    'Two-player casino card game.',
    2,
    2,
    true
  ),
  (
    'snyd',
    'Snyd',
    'Bluffing card game.',
    2,
    6,
    true
  ),
  (
    'fem',
    '500',
    'Five hundred card game.',
    2,
    4,
    true
  ),
  (
    'poker',
    'Poker',
    'Poker placeholder catalog entry.',
    2,
    8,
    false
  )
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  min_players = excluded.min_players,
  max_players = excluded.max_players,
  is_active = excluded.is_active;
