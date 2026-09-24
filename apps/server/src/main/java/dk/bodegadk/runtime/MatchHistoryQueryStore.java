package dk.bodegadk.runtime;

import java.time.Instant;
import java.util.List;

public interface MatchHistoryQueryStore {
    MatchHistoryPage recentMatchesForUser(String userId, int limit, Instant before);

    record MatchHistoryPage(
            List<MatchSummary> items,
            int limit,
            Instant nextCursor
    ) {
    }

    record MatchSummary(
            String matchId,
            GameSummary game,
            String roomCode,
            String status,
            Instant startedAt,
            Instant endedAt,
            String resultType,
            String winnerUserId,
            PlayerSummary currentUser,
            List<PlayerSummary> players
    ) {
    }

    record GameSummary(
            String id,
            String slug,
            String title
    ) {
    }

    record PlayerSummary(
            String userId,
            String username,
            String result,
            Integer score,
            Integer seatIndex
    ) {
    }
}
