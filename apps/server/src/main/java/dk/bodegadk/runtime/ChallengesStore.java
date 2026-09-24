package dk.bodegadk.runtime;

import java.time.Instant;

public interface ChallengesStore {
    ChallengeSummary createChallenge(String challengerUserId, String username, String gameType);

    ChallengeAcceptResult acceptChallenge(String challengedUserId, String challengeId);

    ChallengeSummary declineChallenge(String challengedUserId, String challengeId);

    ChallengeSummary cancelChallenge(String challengerUserId, String challengeId);

    record ChallengeSummary(
            String id,
            String status,
            FriendsStore.FriendUser challenger,
            FriendsStore.FriendUser challenged,
            GameSummary game,
            String roomCode,
            Instant createdAt,
            Instant expiresAt,
            Instant respondedAt
    ) {
    }

    record ChallengeAcceptResult(ChallengeSummary challenge, ChallengeRoom room) {
    }

    record ChallengeRoom(
            String roomCode,
            String playerId,
            String hostPlayerId,
            boolean isPrivate,
            String selectedGame,
            String status
    ) {
    }

    record GameSummary(String id, String slug, String title) {
    }

    class ChallengeNotFoundException extends RuntimeException {
        public ChallengeNotFoundException(String message) {
            super(message);
        }
    }

    class ChallengeConflictException extends RuntimeException {
        public ChallengeConflictException(String message) {
            super(message);
        }
    }

    class ChallengeValidationException extends RuntimeException {
        public ChallengeValidationException(String message) {
            super(message);
        }
    }
}
