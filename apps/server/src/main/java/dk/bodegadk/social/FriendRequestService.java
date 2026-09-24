package dk.bodegadk.social;

import dk.bodegadk.push.WebPushNotificationService;
import org.springframework.stereotype.Service;

@Service
public class FriendRequestService {
    private final FriendRequestStore friendRequestStore;
    private final WebPushNotificationService pushNotificationService;

    public FriendRequestService(
            FriendRequestStore friendRequestStore,
            WebPushNotificationService pushNotificationService
    ) {
        this.friendRequestStore = friendRequestStore;
        this.pushNotificationService = pushNotificationService;
    }

    public FriendRequestResult sendFriendRequest(String senderUserId, String senderUsername, String recipientUserId) {
        FriendRequest request = friendRequestStore.create(senderUserId, senderUsername, recipientUserId);
        int notifiedDevices = pushNotificationService.sendToUser(
                recipientUserId,
                new WebPushNotificationService.PushPayload(
                        "New friend request",
                        displayName(senderUsername, senderUserId) + " sent you a friend request.",
                        "/?view=profile",
                        "friend-request-" + request.id()
                )
        );
        return new FriendRequestResult(request, notifiedDevices);
    }

    private String displayName(String username, String fallbackUserId) {
        if (username != null && !username.isBlank()) {
            return username.trim();
        }
        if (fallbackUserId == null || fallbackUserId.isBlank()) {
            return "Someone";
        }
        return "Player " + fallbackUserId.substring(0, Math.min(8, fallbackUserId.length()));
    }

    public record FriendRequestResult(FriendRequest request, int notifiedDevices) {
    }
}
