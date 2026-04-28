package dk.bodegadk.rest;

import dk.bodegadk.runtime.MatchHistoryQueryStore;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MeControllerTest {

    @Test
    void recentMatchesUsesAuthenticatedUserAndDefaultLimit() {
        CapturingStore store = new CapturingStore();
        MeController controller = new MeController(store);

        MatchHistoryQueryStore.MatchHistoryPage response = controller.recentMatches(authentication("user-1"), null, null);

        assertEquals("user-1", store.userId);
        assertEquals(20, store.limit);
        assertNull(store.before);
        assertEquals(20, response.limit());
    }

    @Test
    void recentMatchesPassesBeforeCursor() {
        CapturingStore store = new CapturingStore();
        MeController controller = new MeController(store);

        controller.recentMatches(authentication("user-1"), 10, "2026-04-28T18:30:00Z");

        assertEquals(10, store.limit);
        assertEquals(Instant.parse("2026-04-28T18:30:00Z"), store.before);
    }

    @Test
    void recentMatchesRejectsInvalidBeforeCursor() {
        CapturingStore store = new CapturingStore();
        MeController controller = new MeController(store);

        assertThrows(
                ResponseStatusException.class,
                () -> controller.recentMatches(authentication("user-1"), 10, "not-a-date")
        );
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

    private static class CapturingStore implements MatchHistoryQueryStore {
        private String userId;
        private int limit;
        private Instant before;

        @Override
        public MatchHistoryPage recentMatchesForUser(String userId, int limit, Instant before) {
            this.userId = userId;
            this.limit = limit;
            this.before = before;
            return new MatchHistoryPage(List.of(), limit, null);
        }
    }
}
