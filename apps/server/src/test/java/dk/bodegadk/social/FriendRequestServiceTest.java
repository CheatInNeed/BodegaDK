package dk.bodegadk.social;

import com.fasterxml.jackson.databind.ObjectMapper;
import dk.bodegadk.push.InMemoryPushSubscriptionStore;
import dk.bodegadk.push.PushProperties;
import dk.bodegadk.push.StoredPushSubscription;
import dk.bodegadk.push.WebPushNotificationService;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FriendRequestServiceTest {

    @Test
    void friendRequestCreatesPendingRequestWhenPushIsNotConfigured() {
        FriendRequestService service = new FriendRequestService(
                new InMemoryFriendRequestStore(),
                new WebPushNotificationService(new PushProperties(), new InMemoryPushSubscriptionStore(), new ObjectMapper())
        );

        FriendRequestService.FriendRequestResult result = service.sendFriendRequest("sender-1", "Alice", "recipient-1");

        assertEquals(FriendRequest.FriendRequestStatus.PENDING, result.request().status());
        assertEquals("recipient-1", result.request().recipientUserId());
        assertEquals(0, result.notifiedDevices());
    }

    @Test
    void pushStoreFindsSubscriptionsForRecipientUser() {
        InMemoryPushSubscriptionStore store = new InMemoryPushSubscriptionStore();
        Instant now = Instant.now();
        store.upsert(new StoredPushSubscription(
                "https://push.example/one",
                "key",
                "auth",
                "recipient-1",
                "Bob",
                "device-1",
                "Desktop browser",
                "agent",
                now,
                now
        ));
        store.upsert(new StoredPushSubscription(
                "https://push.example/two",
                "key",
                "auth",
                "someone-else",
                "Casey",
                "device-2",
                "Desktop browser",
                "agent",
                now,
                now
        ));

        assertEquals(1, store.findActiveByUserId("recipient-1").size());
    }
}
