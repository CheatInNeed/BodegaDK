package dk.bodegadk.rest;

import dk.bodegadk.runtime.ChallengesStore;
import dk.bodegadk.runtime.FriendsStore;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ChallengesControllerTest {
    private static final String CHALLENGE_ID = "33333333-3333-3333-3333-333333333333";

    @Test
    void createUsesAuthenticatedUser() {
        CapturingStore store = new CapturingStore();
        ChallengesController controller = new ChallengesController(store);

        controller.create(authentication("user-1"), new ChallengesController.ChallengeRequest("Bob", "snyd"));

        assertEquals("user-1", store.userId);
        assertEquals("Bob", store.username);
        assertEquals("snyd", store.gameType);
    }

    @Test
    void createRejectsBlankUsername() {
        ChallengesController controller = new ChallengesController(new CapturingStore());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.create(authentication("user-1"), new ChallengesController.ChallengeRequest(" ", "snyd"))
        );

        assertEquals(400, exception.getStatusCode().value());
    }

    @Test
    void acceptRejectsInvalidUuid() {
        ChallengesController controller = new ChallengesController(new CapturingStore());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.accept(authentication("user-1"), "bad-id")
        );

        assertEquals(400, exception.getStatusCode().value());
    }

    @Test
    void acceptMapsExpiredChallengeToConflict() {
        ChallengesController controller = new ChallengesController(new CapturingStore(new ChallengesStore.ChallengeConflictException("Expired")));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.accept(authentication("user-1"), CHALLENGE_ID)
        );

        assertEquals(409, exception.getStatusCode().value());
    }

    private JwtAuthenticationToken authentication(String userId) {
        Jwt jwt = new Jwt(
                "token",
                Instant.now(),
                Instant.now().plusSeconds(60),
                Map.of("alg", "none"),
                Map.of("sub", userId)
        );
        return new JwtAuthenticationToken(jwt);
    }

    private static class CapturingStore implements ChallengesStore {
        private final RuntimeException exception;
        private String userId;
        private String username;
        private String gameType;

        private CapturingStore() {
            this(null);
        }

        private CapturingStore(RuntimeException exception) {
            this.exception = exception;
        }

        @Override
        public ChallengeSummary createChallenge(String challengerUserId, String username, String gameType) {
            this.userId = challengerUserId;
            this.username = username;
            this.gameType = gameType;
            if (exception != null) {
                throw exception;
            }
            return summary("PENDING", null);
        }

        @Override
        public ChallengeAcceptResult acceptChallenge(String challengedUserId, String challengeId) {
            if (exception != null) {
                throw exception;
            }
            return new ChallengeAcceptResult(summary("ACCEPTED", "ABC123"), new ChallengeRoom("ABC123", challengedUserId, "user-1", true, "snyd", "LOBBY"));
        }

        @Override
        public ChallengeSummary declineChallenge(String challengedUserId, String challengeId) {
            if (exception != null) {
                throw exception;
            }
            return summary("DECLINED", null);
        }

        @Override
        public ChallengeSummary cancelChallenge(String challengerUserId, String challengeId) {
            if (exception != null) {
                throw exception;
            }
            return summary("CANCELLED", null);
        }

        private ChallengeSummary summary(String status, String roomCode) {
            FriendsStore.FriendUser alice = new FriendsStore.FriendUser("user-1", "Alice", null);
            FriendsStore.FriendUser bob = new FriendsStore.FriendUser("user-2", "Bob", null);
            return new ChallengeSummary(CHALLENGE_ID, status, alice, bob, new GameSummary("game-1", "snyd", "Snyd"), roomCode, Instant.now(), Instant.now().plusSeconds(60), null);
        }
    }
}
