package dk.bodegadk.rating;

import java.time.Instant;
import java.util.UUID;

public record RatingChange(
        UUID matchId,
        String playerId,
        String gameType,
        int ratingBefore,
        int ratingAfter,
        int delta,
        Instant createdAt
) {
}
