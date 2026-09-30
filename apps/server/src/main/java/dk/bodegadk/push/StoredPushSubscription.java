package dk.bodegadk.push;

import java.time.Instant;

public record StoredPushSubscription(
        String endpoint,
        String p256dh,
        String auth,
        String userId,
        String username,
        String deviceId,
        String deviceLabel,
        String userAgent,
        Instant createdAt,
        Instant lastSeenAt
) {
}
