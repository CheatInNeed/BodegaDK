# Leaderboard Scoring V1

Status: implemented for leaderboard writes, API reads, and the first profile-adjacent UI surface.

## Snyd V1 Rule

- Leaderboard score is all-time wins.
- There are no seasons.
- `leaderboard_scores.score` stores the user's all-time win count for a game and mode.
- `leaderboard_scores.mode` defaults to `standard`.
- Store one current row per `(game_id, user_id, mode)`.
- `match_id` may point at the latest match that changed the score.

## Result Classification

- For 2-player games, one player wins and one player loses.
- For games with more than 2 players, the top 50% of players for that match count as winners.
- Everyone outside the top 50% counts as a loss.
- Draws can still exist in match history and user stats, but draws do not add leaderboard score in V1.

## Out Of Scope

- No rating/ELO, win-rate ranking, season reset, or per-match leaderboard rows in V1.
