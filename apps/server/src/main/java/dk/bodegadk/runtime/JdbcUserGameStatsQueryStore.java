package dk.bodegadk.runtime;

import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;

public class JdbcUserGameStatsQueryStore implements UserGameStatsQueryStore {
    private static final String BASE_SELECT = """
            select
              games.id::text as game_id,
              games.slug as game_slug,
              games.title as game_title,
              coalesce(user_game_stats.games_played, 0) as games_played,
              coalesce(user_game_stats.wins, 0) as wins,
              coalesce(user_game_stats.losses, 0) as losses,
              coalesce(user_game_stats.draws, 0) as draws,
              coalesce(user_game_stats.high_score, 0) as high_score,
              coalesce(user_game_stats.current_streak, 0) as current_streak,
              coalesce(user_game_stats.best_streak, 0) as best_streak,
              coalesce(user_game_stats.total_play_time_seconds, 0) as total_play_time_seconds,
              user_game_stats.last_played_at
            from public.games
            left join public.user_game_stats
              on user_game_stats.game_id = games.id
             and user_game_stats.user_id = ?::uuid
            where games.is_active = true
            """;

    private static final String ORDER_BY = """
            order by games.title asc
            """;

    private final JdbcTemplate jdbcTemplate;

    public JdbcUserGameStatsQueryStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public UserGameStatsPage statsForUser(String userId, String gameSlug) {
        String sql = gameSlug == null
                ? BASE_SELECT + ORDER_BY
                : BASE_SELECT + "  and games.slug = ?\n" + ORDER_BY;

        Object[] args = gameSlug == null
                ? new Object[] { userId }
                : new Object[] { userId, gameSlug };

        return new UserGameStatsPage(jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new UserGameStatsSummary(
                        new GameSummary(
                                rs.getString("game_id"),
                                rs.getString("game_slug"),
                                rs.getString("game_title")
                        ),
                        rs.getInt("games_played"),
                        rs.getInt("wins"),
                        rs.getInt("losses"),
                        rs.getInt("draws"),
                        rs.getLong("high_score"),
                        rs.getInt("current_streak"),
                        rs.getInt("best_streak"),
                        rs.getInt("total_play_time_seconds"),
                        toInstant(rs.getTimestamp("last_played_at"))
                ),
                args
        ));
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
