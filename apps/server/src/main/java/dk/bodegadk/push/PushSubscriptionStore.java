package dk.bodegadk.push;

import java.util.List;
import java.util.Optional;

public interface PushSubscriptionStore {
    void upsert(StoredPushSubscription subscription);

    Optional<StoredPushSubscription> findActiveByEndpoint(String endpoint);

    List<StoredPushSubscription> activeSubscriptions();

    boolean deleteByEndpoint(String endpoint);
}
