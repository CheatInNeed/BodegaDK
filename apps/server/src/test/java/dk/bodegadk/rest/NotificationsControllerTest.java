package dk.bodegadk.rest;

import dk.bodegadk.runtime.NotificationsStore;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class NotificationsControllerTest {

    @Test
    void notificationsUsesAuthenticatedUserAndDefaultLimit() {
        CapturingStore store = new CapturingStore();
        NotificationsController controller = new NotificationsController(store);

        controller.notifications(authentication("user-1"), null);

        assertEquals("user-1", store.userId);
        assertEquals(20, store.limit);
    }

    @Test
    void markReadRejectsInvalidUuid() {
        NotificationsController controller = new NotificationsController(new CapturingStore());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.markRead(authentication("user-1"), "bad-id")
        );

        assertEquals(400, exception.getStatusCode().value());
    }

    @Test
    void markReadMapsMissingToNotFound() {
        NotificationsController controller = new NotificationsController(new CapturingStore(new NotificationsStore.NotificationNotFoundException("Missing")));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.markRead(authentication("user-1"), "11111111-1111-1111-1111-111111111111")
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

    private static class CapturingStore implements NotificationsStore {
        private final RuntimeException exception;
        private String userId;
        private int limit;

        private CapturingStore() {
            this(null);
        }

        private CapturingStore(RuntimeException exception) {
            this.exception = exception;
        }

        @Override
        public NotificationPage notifications(String currentUserId, int limit) {
            this.userId = currentUserId;
            this.limit = limit;
            return new NotificationPage(List.of(), 0, limit);
        }

        @Override
        public NotificationSummary markRead(String currentUserId, String notificationId) {
            if (exception != null) {
                throw exception;
            }
            return new NotificationSummary(notificationId, "test", null, Map.of(), Instant.now(), Instant.now());
        }

        @Override
        public void markAllRead(String currentUserId) {
            this.userId = currentUserId;
        }

        @Override
        public void createIfUnreadMissing(String userId, String actorUserId, String type, Map<String, Object> payload) {
        }
    }
}
