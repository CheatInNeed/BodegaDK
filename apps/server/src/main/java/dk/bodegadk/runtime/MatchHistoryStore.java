package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public interface MatchHistoryStore {
    void recordCompletedMatch(String roomCode, String winnerUserId, JsonNode finalState);

    default void recordCompletedMatch(
            String roomCode,
            String winnerUserId,
            List<CompletedParticipant> participants,
            JsonNode finalState
    ) {
        recordCompletedMatch(roomCode, winnerUserId, finalState);
    }

    record CompletedParticipant(String playerId, int placement, boolean abandoned) {
    }
}
