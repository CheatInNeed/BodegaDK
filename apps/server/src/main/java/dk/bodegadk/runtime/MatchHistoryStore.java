package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;

public interface MatchHistoryStore {
    void recordCompletedMatch(String roomCode, String winnerUserId, JsonNode finalState);
}
