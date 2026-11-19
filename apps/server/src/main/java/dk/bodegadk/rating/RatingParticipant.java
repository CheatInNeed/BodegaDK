package dk.bodegadk.rating;

/**
 * A participant's immutable result snapshot used by rating calculators.
 */
public record RatingParticipant(
        String playerId,
        int rating,
        int gamesPlayed,
        int placement,
        boolean abandoned
) {
    public RatingParticipant {
        if (playerId == null || playerId.isBlank()) {
            throw new IllegalArgumentException("playerId is required");
        }
        if (rating < 0 || gamesPlayed < 0 || placement < 1) {
            throw new IllegalArgumentException("Invalid rating participant");
        }
    }
}
