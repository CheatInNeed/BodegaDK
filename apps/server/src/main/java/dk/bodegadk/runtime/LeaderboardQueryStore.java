package dk.bodegadk.runtime;

import java.util.List;

public interface LeaderboardQueryStore {
    LeaderboardPage leaderboard(String currentUserId, String gameSlug, String mode, int limit);

    record LeaderboardPage(
            GameSummary game,
            String mode,
            List<LeaderboardEntry> items,
            CurrentUserRank currentUser,
            int limit
    ) {
    }

    record GameSummary(String id, String slug, String title) {
    }

    record LeaderboardEntry(
            int rank,
            String userId,
            String username,
            String displayName,
            AvatarSummary avatar,
            int score,
            String matchId
    ) {
    }

    record AvatarSummary(String color, String shape, String assetUrl) {
    }

    record CurrentUserRank(int rank, int score) {
    }

    class UnknownGameException extends RuntimeException {
        public UnknownGameException(String gameSlug) {
            super("Unknown game: " + gameSlug);
        }
    }
}
