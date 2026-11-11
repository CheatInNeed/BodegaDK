package dk.bodegadk.rating;

import dk.bodegadk.runtime.GameCatalogService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public class RatingQueryService {
    private final JdbcTemplate jdbcTemplate;
    private final RatingRepository ratingRepository;
    private final GameCatalogService gameCatalogService;

    public RatingQueryService(
            JdbcTemplate jdbcTemplate,
            RatingRepository ratingRepository,
            GameCatalogService gameCatalogService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.ratingRepository = ratingRepository;
        this.gameCatalogService = gameCatalogService;
    }

    @Transactional(readOnly = true)
    public Optional<PlayerGameRating> rating(String playerId, String gameType) {
        String normalizedGame = requireGame(gameType);
        return ratingRepository.find(playerId, normalizedGame);
    }

    @Transactional(readOnly = true)
    public List<PlayerGameRating> allRatings(String playerId) {
        return ratingRepository.findAll(playerId);
    }

    @Transactional(readOnly = true)
    public Page<LeaderboardEntry> leaderboard(String gameType, int page, int size) {
        String normalizedGame = requireGame(gameType);
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.max(1, Math.min(size, 100));
        int offset = boundedPage * boundedSize;
        List<LeaderboardEntry> entries = jdbcTemplate.query(
                """
                select row_number() over (order by pgr.rating desc, pgr.player_id) as rank,
                       pgr.player_id::text as player_id,
                       coalesce(profiles.username, pgr.player_id::text) as username,
                       pgr.rating, pgr.games_played, pgr.peak_rating
                from public.player_game_ratings pgr
                join public.games on games.id = pgr.game_id
                left join public.profiles on profiles.user_id = pgr.player_id
                where games.slug = lower(trim(?))
                  and pgr.games_played > 0
                order by pgr.rating desc, pgr.player_id
                limit ? offset ?
                """,
                (rs, rowNum) -> new LeaderboardEntry(
                        rs.getLong("rank"),
                        rs.getString("player_id"),
                        rs.getString("username"),
                        rs.getInt("rating"),
                        rs.getInt("games_played"),
                        rs.getInt("peak_rating")
                ),
                normalizedGame, boundedSize, offset
        );
        Integer total = jdbcTemplate.queryForObject(
                """
                select count(*)
                from public.player_game_ratings pgr
                join public.games on games.id = pgr.game_id
                where games.slug = lower(trim(?))
                  and pgr.games_played > 0
                """,
                Integer.class,
                normalizedGame
        );
        return new Page<>(entries, boundedPage, boundedSize, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public Page<RatingChange> history(String playerId, String gameType, int page, int size) {
        String normalizedGame = requireGame(gameType);
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.max(1, Math.min(size, 100));
        int offset = boundedPage * boundedSize;
        List<RatingChange> entries = jdbcTemplate.query(
                """
                select rc.match_id, rc.player_id::text as player_id, games.slug as game_type,
                       rc.rating_before, rc.rating_after, rc.delta, rc.created_at
                from public.rating_changes rc
                join public.games on games.id = rc.game_id
                where rc.player_id = ?::uuid and games.slug = lower(trim(?))
                order by rc.created_at desc, rc.id desc
                limit ? offset ?
                """,
                (rs, rowNum) -> new RatingChange(
                        rs.getObject("match_id", UUID.class),
                        rs.getString("player_id"),
                        rs.getString("game_type"),
                        rs.getInt("rating_before"),
                        rs.getInt("rating_after"),
                        rs.getInt("delta"),
                        rs.getTimestamp("created_at").toInstant()
                ),
                playerId, normalizedGame, boundedSize, offset
        );
        Integer total = jdbcTemplate.queryForObject(
                """
                select count(*)
                from public.rating_changes rc
                join public.games on games.id = rc.game_id
                where rc.player_id = ?::uuid and games.slug = lower(trim(?))
                """,
                Integer.class,
                playerId, normalizedGame
        );
        return new Page<>(entries, boundedPage, boundedSize, total == null ? 0 : total);
    }

    private String requireGame(String gameType) {
        return gameCatalogService.require(gameType).id();
    }

    public record LeaderboardEntry(
            long rank,
            String playerId,
            String username,
            int rating,
            int gamesPlayed,
            int peakRating
    ) {
    }

    public record Page<T>(List<T> items, int page, int size, int total) {
        public Page {
            items = List.copyOf(items);
        }
    }
}
