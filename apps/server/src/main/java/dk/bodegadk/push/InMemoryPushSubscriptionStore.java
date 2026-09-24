package dk.bodegadk.push;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class InMemoryPushSubscriptionStore implements PushSubscriptionStore {
    private final ConcurrentMap<String, StoredPushSubscription> subscriptions = new ConcurrentHashMap<>();

    @Override
    public void upsert(StoredPushSubscription subscription) {
        subscriptions.put(subscription.endpoint(), subscription);
    }

    @Override
    public Optional<StoredPushSubscription> findActiveByEndpoint(String endpoint) {
        return Optional.ofNullable(subscriptions.get(endpoint));
    }

    @Override
    public List<StoredPushSubscription> findActiveByUserId(String userId) {
        return subscriptions.values().stream()
                .filter(subscription -> userId != null && userId.equals(subscription.userId()))
                .toList();
    }

    @Override
    public List<StoredPushSubscription> activeSubscriptions() {
        return subscriptions.values().stream().toList();
    }

    @Override
    public boolean deleteByEndpoint(String endpoint) {
        return subscriptions.remove(endpoint) != null;
    }
}
