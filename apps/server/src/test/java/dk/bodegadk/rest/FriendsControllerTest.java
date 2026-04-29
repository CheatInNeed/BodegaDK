package dk.bodegadk.rest;

import dk.bodegadk.runtime.FriendsStore;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class FriendsControllerTest {

    @Test
    void friendsUsesAuthenticatedUser() {
        CapturingStore store = new CapturingStore();
        FriendsController controller = new FriendsController(store);

        controller.friends(authentication("user-1"));

        assertEquals("user-1", store.currentUserId);
    }

    @Test
    void requestTrimsAndPassesUsername() {
        CapturingStore store = new CapturingStore();
        FriendsController controller = new FriendsController(store);

        controller.request(authentication("user-1"), new FriendsController.FriendRequest(" Alice "));

        assertEquals("user-1", store.currentUserId);
        assertEquals(" Alice ", store.username);
    }

    @Test
    void requestRejectsBlankUsername() {
        FriendsController controller = new FriendsController(new CapturingStore());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.request(authentication("user-1"), new FriendsController.FriendRequest(" "))
        );

        assertEquals(400, exception.getStatusCode().value());
    }

    @Test
    void requestMapsDuplicateToConflict() {
        FriendsController controller = new FriendsController(new CapturingStore(new FriendsStore.DuplicateFriendshipException("Duplicate")));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.request(authentication("user-1"), new FriendsController.FriendRequest("Alice"))
        );

        assertEquals(409, exception.getStatusCode().value());
    }

    @Test
    void acceptRejectsInvalidUuid() {
        FriendsController controller = new FriendsController(new CapturingStore());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.accept(authentication("user-1"), "not-a-uuid")
        );

        assertEquals(400, exception.getStatusCode().value());
    }

    @Test
    void acceptMapsUnauthorizedOrMissingRequestToNotFound() {
        FriendsController controller = new FriendsController(new CapturingStore(new FriendsStore.FriendNotFoundException("Missing")));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.accept(authentication("user-1"), "11111111-1111-1111-1111-111111111111")
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

    private static class CapturingStore implements FriendsStore {
        private final RuntimeException sendException;
        private String currentUserId;
        private String username;

        private CapturingStore() {
            this(null);
        }

        private CapturingStore(RuntimeException sendException) {
            this.sendException = sendException;
        }

        @Override
        public List<FriendshipSummary> acceptedFriends(String currentUserId) {
            this.currentUserId = currentUserId;
            return List.of();
        }

        @Override
        public FriendRequestPage pendingRequests(String currentUserId) {
            this.currentUserId = currentUserId;
            return new FriendRequestPage(List.of(), List.of());
        }

        @Override
        public FriendshipSummary sendRequest(String currentUserId, String username) {
            this.currentUserId = currentUserId;
            this.username = username;
            if (sendException != null) {
                throw sendException;
            }
            return summary();
        }

        @Override
        public FriendshipSummary acceptRequest(String currentUserId, String friendshipId) {
            if (sendException != null) {
                throw sendException;
            }
            this.currentUserId = currentUserId;
            return summary();
        }

        @Override
        public FriendshipSummary declineRequest(String currentUserId, String friendshipId) {
            if (sendException != null) {
                throw sendException;
            }
            this.currentUserId = currentUserId;
            return summary();
        }

        @Override
        public void remove(String currentUserId, String friendshipId) {
            if (sendException != null) {
                throw sendException;
            }
            this.currentUserId = currentUserId;
        }

        private FriendshipSummary summary() {
            FriendUser requester = new FriendUser("user-1", "Alice", null);
            FriendUser addressee = new FriendUser("user-2", "Bob", null);
            return new FriendshipSummary("11111111-1111-1111-1111-111111111111", "PENDING", requester, addressee, Instant.now(), Instant.now());
        }
    }
}
