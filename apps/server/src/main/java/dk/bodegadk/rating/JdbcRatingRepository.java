package dk.bodegadk.rating;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public class JdbcRatingRepository implements RatingRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcRatingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public PlayerGameRating findOrCreate(String playerId, String gameType) {
        jdbcTemplate.update(
                """
                insert into public.player_game_ratings (player_id, game_id)
                values (?::uuid, public.resolve_game_id(?))
                on conflict (player_id, game_id) do nothing
                """,
                playerId, gameType
        );
        return find(playerId, gameType).orElseThrow();
    }

    @Override
    public Optional<PlayerGameRating> find(String playerId, String gameType) {
        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject(
                    """
                    select player_game_ratings.player_id::text as player_id,
                           games.slug as game_type,
                           rating, games_played, peak_rating, version, updated_at
                    from public.player_game_ratings
                    join public.games on games.id = player_game_ratings.game_id
                    where player_game_ratings.player_id = ?::uuid
                      and games.slug = lower(trim(?))
                    """,
                    (rs, rowNum) -> new PlayerGameRating(
                            rs.getString("player_id"),
                            rs.getString("game_type"),
                            rs.getInt("rating"),
                            rs.getInt("games_played"),
                            rs.getInt("peak_rating"),
                            rs.getLong("version"),
                            rs.getTimestamp("updated_at").toInstant()
                    ),
                    playerId, gameType
            ));
        } catch (EmptyResultDataAccessException exception) {
            return Optional.empty();
        }
    }

    @Override
    public List<PlayerGameRating> findAll(String playerId) {
        return jdbcTemplate.query(
                """
                select player_game_ratings.player_id::text as player_id,
                       games.slug as game_type,
                       rating, games_played, peak_rating, version, updated_at
                from public.player_game_ratings
                join public.games on games.id = player_game_ratings.game_id
                where player_game_ratings.player_id = ?::uuid
                order by games.slug
                """,
                (rs, rowNum) -> new PlayerGameRating(
                        rs.getString("player_id"),
                        rs.getString("game_type"),
                        rs.getInt("rating"),
                        rs.getInt("games_played"),
                        rs.getInt("peak_rating"),
                        rs.getLong("version"),
                        rs.getTimestamp("updated_at").toInstant()
                ),
                playerId
        );
    }

    @Override
    public boolean hasChanges(UUID matchId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from public.rating_changes where match_id = ?",
                Integer.class,
                matchId
        );
        return count != null && count > 0;
    }

    @Override
    public void lockMatch(UUID matchId) {
        jdbcTemplate.queryForObject(
                "select pg_advisory_xact_lock(hashtext(?))",
                Object.class,
                matchId.toString()
        );
    }

    @Override
    public void update(PlayerGameRating rating, int newRating, int newGamesPlayed, int newPeakRating) {
        int rows = jdbcTemplate.update(
                """
                update public.player_game_ratings
                set rating = ?, games_played = ?, peak_rating = ?, version = version + 1, updated_at = now()
                where player_id = ?::uuid
                  and game_id = public.resolve_game_id(?)
                  and version = ?
                """,
                newRating,
                newGamesPlayed,
                newPeakRating,
                rating.playerId(),
                rating.gameType(),
                rating.version()
        );
        if (rows != 1) {
            throw new ConcurrentRatingUpdateException(rating.playerId(), rating.gameType());
        }
    }

    @Override
    public void insertChange(RatingChange change) {
        jdbcTemplate.update(
                """
                insert into public.rating_changes
                    (match_id, player_id, game_id, rating_before, rating_after, delta, created_at)
                values (?, ?::uuid, public.resolve_game_id(?), ?, ?, ?, ?)
                """,
                change.matchId(),
                change.playerId(),
                change.gameType(),
                change.ratingBefore(),
                change.ratingAfter(),
                change.delta(),
                Timestamp.from(change.createdAt())
        );
    }

    public static class ConcurrentRatingUpdateException extends RuntimeException {
        public ConcurrentRatingUpdateException(String playerId, String gameType) {
            super("Rating changed concurrently for " + playerId + " in " + gameType);
        }
    }
}
