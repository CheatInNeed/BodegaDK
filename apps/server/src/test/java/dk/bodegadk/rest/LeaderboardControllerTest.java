package dk.bodegadk.rest;

import dk.bodegadk.runtime.LeaderboardQueryStore;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LeaderboardControllerTest {

    @Test
    void leaderboardUsesAuthenticatedUserAndDefaults() {
        CapturingStore store = new CapturingStore();
        LeaderboardController controller = new LeaderboardController(store);

        LeaderboardQueryStore.LeaderboardPage response = controller.leaderboard(authentication("user-1"), "snyd", null, null);

        assertEquals("user-1", store.currentUserId);
        assertEquals("snyd", store.gameSlug);
        assertEquals("standard", store.mode);
        assertEquals(20, store.limit);
        assertEquals("snyd", response.game().slug());
    }

    @Test
    void leaderboardPassesModeAndLimit() {
        CapturingStore store = new CapturingStore();
        LeaderboardController controller = new LeaderboardController(store);

        controller.leaderboard(authentication("user-1"), "snyd", "standard", 50);

        assertEquals("standard", store.mode);
        assertEquals(50, store.limit);
    }

    @Test
    void leaderboardRejectsMissingGame() {
        LeaderboardController controller = new LeaderboardController(new CapturingStore());

        assertThrows(
                ResponseStatusException.class,
                () -> controller.leaderboard(authentication("user-1"), " ", null, null)
        );
    }

    @Test
    void leaderboardMapsUnknownGameToNotFound() {
        LeaderboardController controller = new LeaderboardController(new CapturingStore(true));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.leaderboard(authentication("user-1"), "missing", null, null)
        );
        assertEquals(404, exception.getStatusCode().value());
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

    private static class CapturingStore implements LeaderboardQueryStore {
        private final boolean throwUnknownGame;
        private String currentUserId;
        private String gameSlug;
        private String mode;
        private int limit;

        private CapturingStore() {
            this(false);
        }

        private CapturingStore(boolean throwUnknownGame) {
            this.throwUnknownGame = throwUnknownGame;
        }

        @Override
        public LeaderboardPage leaderboard(String currentUserId, String gameSlug, String mode, int limit) {
            if (throwUnknownGame) {
                throw new UnknownGameException(gameSlug);
            }
            this.currentUserId = currentUserId;
            this.gameSlug = gameSlug;
            this.mode = mode;
            this.limit = limit;
            return new LeaderboardPage(
                    new GameSummary("game-id", gameSlug, "Snyd"),
                    mode,
                    List.of(),
                    null,
                    limit
            );
        }
    }
}
