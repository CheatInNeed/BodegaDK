package dk.bodegadk.push;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InMemoryPushSubscriptionStoreTest {

    @Test
    void upsertReplacesExistingSubscriptionForEndpoint() {
        InMemoryPushSubscriptionStore store = new InMemoryPushSubscriptionStore();
        Instant now = Instant.now();

        store.upsert(new StoredPushSubscription(
                "https://push.example/one",
                "first-key",
                "first-auth",
                "user-1",
                "Alice",
                "device-1",
                "Desktop browser",
                "agent",
                now,
                now
        ));
        store.upsert(new StoredPushSubscription(
                "https://push.example/one",
                "second-key",
                "second-auth",
                "user-1",
                "Alice",
                "device-1",
                "Desktop browser",
                "agent",
                now,
                now
        ));

        StoredPushSubscription stored = store.findActiveByEndpoint("https://push.example/one").orElseThrow();
        assertEquals("second-key", stored.p256dh());
        assertEquals(1, store.activeSubscriptions().size());
    }

    @Test
    void deleteByEndpointRemovesSubscription() {
        InMemoryPushSubscriptionStore store = new InMemoryPushSubscriptionStore();
        Instant now = Instant.now();
        store.upsert(new StoredPushSubscription(
                "https://push.example/one",
                "key",
                "auth",
                null,
                null,
                "device-1",
                "Phone browser",
                "agent",
                now,
                now
        ));

        assertTrue(store.deleteByEndpoint("https://push.example/one"));
        assertTrue(store.findActiveByEndpoint("https://push.example/one").isEmpty());
    }
}
