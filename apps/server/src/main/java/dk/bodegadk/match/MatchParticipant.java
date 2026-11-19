package dk.bodegadk.match;

public record MatchParticipant(
        String playerId,
        int placement,
        boolean abandoned
) {
    public MatchParticipant {
        if (playerId == null || playerId.isBlank() || placement < 1) {
            throw new IllegalArgumentException("Invalid match participant");
        }
    }
}
