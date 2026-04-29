package dk.bodegadk.runtime;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public interface NotificationsStore {
    NotificationPage notifications(String currentUserId, int limit);

    NotificationSummary markRead(String currentUserId, String notificationId);

    void markAllRead(String currentUserId);

    void createIfUnreadMissing(String userId, String actorUserId, String type, Map<String, Object> payload);

    record NotificationPage(List<NotificationSummary> items, int unreadCount, int limit) {
    }

    record NotificationSummary(
            String id,
            String type,
            FriendsStore.FriendUser actor,
            Map<String, Object> payload,
            Instant readAt,
            Instant createdAt
    ) {
    }

    class NotificationNotFoundException extends RuntimeException {
        public NotificationNotFoundException(String message) {
            super(message);
        }
    }
}
