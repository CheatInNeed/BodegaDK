package dk.bodegadk.social;

import java.time.Instant;
import java.util.UUID;

public record FriendRequest(
        UUID id,
        String senderUserId,
        String senderUsername,
        String recipientUserId,
        FriendRequestStatus status,
        Instant createdAt
) {
    public enum FriendRequestStatus {
        PENDING,
        ACCEPTED,
        DECLINED,
        CANCELLED
    }
}
