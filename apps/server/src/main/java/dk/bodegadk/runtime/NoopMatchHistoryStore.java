package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;

public class NoopMatchHistoryStore implements MatchHistoryStore {
    @Override
    public void recordCompletedMatch(String roomCode, String winnerUserId, JsonNode finalState) {
        // Local no-DB mode has no durable match history.
    }
}
