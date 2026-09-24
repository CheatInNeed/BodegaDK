package dk.bodegadk.runtime;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

public class JdbcLeaderboardQueryStore implements LeaderboardQueryStore {
    private final JdbcTemplate jdbcTemplate;

    public JdbcLeaderboardQueryStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public LeaderboardPage leaderboard(String currentUserId, String gameSlug, String mode, int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        String normalizedMode = mode == null || mode.isBlank() ? "standard" : mode.trim();
        GameSummary game = game(gameSlug);

        List<LeaderboardEntry> items = jdbcTemplate.query(
                """
                with ranked as (
                  select
                    leaderboard_scores.user_id::text as user_id,
                    coalesce(profiles.username, leaderboard_scores.username_snapshot, leaderboard_scores.user_id::text) as username,
                    coalesce(profiles.display_name, profiles.username, leaderboard_scores.username_snapshot, leaderboard_scores.user_id::text) as display_name,
                    user_avatars.color,
                    avatar_defs.shape,
                    avatar_defs.asset_url,
                    leaderboard_scores.score,
                    leaderboard_scores.match_id::text as match_id,
                    row_number() over (
                      order by leaderboard_scores.score desc,
                               lower(coalesce(profiles.username, leaderboard_scores.username_snapshot, leaderboard_scores.user_id::text)) asc,
                               leaderboard_scores.user_id asc
                    ) as rank
                  from public.leaderboard_scores
                  left join public.profiles on profiles.user_id = leaderboard_scores.user_id
                  left join public.user_avatars on user_avatars.user_id = leaderboard_scores.user_id
                  left join public.avatar_defs on avatar_defs.id = user_avatars.avatar_def_id
                  where leaderboard_scores.game_id = ?::uuid
                    and leaderboard_scores.mode = ?
                )
                select *
                from ranked
                order by rank asc
                limit ?
                """,
                (rs, rowNum) -> new LeaderboardEntry(
                        rs.getInt("rank"),
                        rs.getString("user_id"),
                        rs.getString("username"),
                        rs.getString("display_name"),
                        new AvatarSummary(
                                rs.getString("color"),
                                rs.getString("shape"),
                                rs.getString("asset_url")
                        ),
                        rs.getInt("score"),
                        rs.getString("match_id")
                ),
                game.id(),
                normalizedMode,
                boundedLimit
        );

        CurrentUserRank currentUser = currentUserRank(currentUserId, game.id(), normalizedMode);
        return new LeaderboardPage(game, normalizedMode, items, currentUser, boundedLimit);
    }

    private GameSummary game(String gameSlug) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    select id::text as id, slug, title
                    from public.games
                    where slug = ?
                    """,
                    (rs, rowNum) -> new GameSummary(
                            rs.getString("id"),
                            rs.getString("slug"),
                            rs.getString("title")
                    ),
                    gameSlug
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new UnknownGameException(gameSlug);
        }
    }

    private CurrentUserRank currentUserRank(String currentUserId, String gameId, String mode) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    with ranked as (
                      select
                        leaderboard_scores.user_id,
                        leaderboard_scores.score,
                        row_number() over (
                          order by leaderboard_scores.score desc,
                                   lower(coalesce(profiles.username, leaderboard_scores.username_snapshot, leaderboard_scores.user_id::text)) asc,
                                   leaderboard_scores.user_id asc
                        ) as rank
                      from public.leaderboard_scores
                      left join public.profiles on profiles.user_id = leaderboard_scores.user_id
                      where leaderboard_scores.game_id = ?::uuid
                        and leaderboard_scores.mode = ?
                    )
                    select rank, score
                    from ranked
                    where user_id = ?::uuid
                    """,
                    (rs, rowNum) -> new CurrentUserRank(rs.getInt("rank"), rs.getInt("score")),
                    gameId,
                    mode,
                    currentUserId
            );
        } catch (EmptyResultDataAccessException exception) {
            return null;
        }
    }
}
