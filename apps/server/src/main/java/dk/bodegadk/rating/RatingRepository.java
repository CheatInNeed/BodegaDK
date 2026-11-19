package dk.bodegadk.rating;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RatingRepository {
    PlayerGameRating findOrCreate(String playerId, String gameType);

    Optional<PlayerGameRating> find(String playerId, String gameType);

    List<PlayerGameRating> findAll(String playerId);

    boolean hasChanges(UUID matchId);

    default void lockMatch(UUID matchId) {
        // In-memory implementations do not need a database transaction lock.
    }

    void update(PlayerGameRating rating, int newRating, int newGamesPlayed, int newPeakRating);

    void insertChange(RatingChange change);
}
