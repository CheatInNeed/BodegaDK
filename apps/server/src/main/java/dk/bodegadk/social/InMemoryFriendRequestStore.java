package dk.bodegadk.social;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class InMemoryFriendRequestStore implements FriendRequestStore {
    private final ConcurrentMap<UUID, FriendRequest> requests = new ConcurrentHashMap<>();

    @Override
    public FriendRequest create(String senderUserId, String senderUsername, String recipientUserId) {
        FriendRequest request = new FriendRequest(
                UUID.randomUUID(),
                senderUserId,
                clean(senderUsername),
                recipientUserId,
                FriendRequest.FriendRequestStatus.PENDING,
                Instant.now()
        );
        requests.put(request.id(), request);
        return request;
    }

    private String clean(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
