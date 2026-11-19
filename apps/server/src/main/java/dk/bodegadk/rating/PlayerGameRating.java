package dk.bodegadk.rating;

import java.time.Instant;

/**
 * The current rating for one player and one game.
 *
 * <p>The version is used by the JDBC repository for optimistic locking. This
 * project deliberately does not use JPA entities.</p>
 */
public record PlayerGameRating(
        String playerId,
        String gameType,
        int rating,
        int gamesPlayed,
        int peakRating,
        long version,
        Instant updatedAt
) {
    public static final int DEFAULT_RATING = 1200;

    public PlayerGameRating {
        if (rating < 0 || gamesPlayed < 0 || peakRating < 0 || version < 0) {
            throw new IllegalArgumentException("Rating values cannot be negative");
        }
    }

    public static PlayerGameRating provisional(String playerId, String gameType, Instant now) {
        return new PlayerGameRating(
                playerId, gameType, DEFAULT_RATING, 0, DEFAULT_RATING, 0, now
        );
    }
}
