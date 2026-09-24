package dk.bodegadk.runtime;

import java.time.Instant;
import java.util.List;

public interface UserGameStatsQueryStore {
    UserGameStatsPage statsForUser(String userId, String gameSlug);

    record UserGameStatsPage(List<UserGameStatsSummary> items) {
    }

    record UserGameStatsSummary(
            GameSummary game,
            int gamesPlayed,
            int wins,
            int losses,
            int draws,
            long highScore,
            int currentStreak,
            int bestStreak,
            int totalPlayTimeSeconds,
            Instant lastPlayedAt
    ) {
    }

    record GameSummary(String id, String slug, String title) {
    }
}
