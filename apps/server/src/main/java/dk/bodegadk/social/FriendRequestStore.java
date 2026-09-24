package dk.bodegadk.social;

public interface FriendRequestStore {
    FriendRequest create(String senderUserId, String senderUsername, String recipientUserId);
}
