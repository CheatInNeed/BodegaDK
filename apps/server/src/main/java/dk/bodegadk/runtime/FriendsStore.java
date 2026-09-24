package dk.bodegadk.runtime;

import java.time.Instant;
import java.util.List;

public interface FriendsStore {
    List<FriendshipSummary> acceptedFriends(String currentUserId);

    FriendRequestPage pendingRequests(String currentUserId);

    FriendshipSummary sendRequest(String currentUserId, String username);

    FriendshipSummary acceptRequest(String currentUserId, String friendshipId);

    FriendshipSummary declineRequest(String currentUserId, String friendshipId);

    void remove(String currentUserId, String friendshipId);

    record FriendRequestPage(List<FriendshipSummary> incoming, List<FriendshipSummary> outgoing) {
    }

    record FriendshipSummary(
            String id,
            String status,
            FriendUser requester,
            FriendUser addressee,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    record FriendUser(String userId, String username, String displayName) {
    }

    class FriendNotFoundException extends RuntimeException {
        public FriendNotFoundException(String message) {
            super(message);
        }
    }

    class DuplicateFriendshipException extends RuntimeException {
        public DuplicateFriendshipException(String message) {
            super(message);
        }
    }

    class SelfFriendshipException extends RuntimeException {
        public SelfFriendshipException() {
            super("Users cannot friend themselves");
        }
    }
}
