package dk.bodegadk.push;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.apache.http.HttpResponse;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.stereotype.Service;

import java.security.Security;
import java.time.Instant;
import java.util.NoSuchElementException;

@Service
public class WebPushNotificationService {
    private static final int HTTP_GONE = 410;
    private static final int HTTP_NOT_FOUND = 404;

    private final PushProperties properties;
    private final PushSubscriptionStore subscriptionStore;
    private final ObjectMapper objectMapper;

    public WebPushNotificationService(
            PushProperties properties,
            PushSubscriptionStore subscriptionStore,
            ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.subscriptionStore = subscriptionStore;
        this.objectMapper = objectMapper;
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    public boolean enabled() {
        return properties.enabled();
    }

    public void sendTest(String endpoint) {
        sendToEndpoint(endpoint, new PushPayload(
                "BodegaDK",
                "Push notifications are ready on this device.",
                "/?view=settings",
                "bodegadk-test"
        ));
    }

    public void sendToEndpoint(String endpoint, PushPayload payload) {
        if (!enabled()) {
            throw new IllegalStateException("Push notifications are not configured");
        }

        StoredPushSubscription subscription = subscriptionStore.findActiveByEndpoint(endpoint)
                .orElseThrow(() -> new NoSuchElementException("Push subscription not found"));

        try {
            Notification notification = new Notification(
                    subscription.endpoint(),
                    subscription.p256dh(),
                    subscription.auth(),
                    objectMapper.writeValueAsString(payload)
            );
            PushService pushService = new PushService(
                    properties.getPublicKey(),
                    properties.getPrivateKey(),
                    properties.getSubject()
            );
            HttpResponse response = pushService.send(notification);
            int statusCode = response.getStatusLine().getStatusCode();
            if (statusCode == HTTP_GONE || statusCode == HTTP_NOT_FOUND) {
                subscriptionStore.deleteByEndpoint(endpoint);
            }
            if (statusCode >= 400) {
                throw new IllegalStateException("Push service rejected notification with status " + statusCode);
            }
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize push payload", exception);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to send push notification", exception);
        }
    }

    public StoredPushSubscription createStoredSubscription(
            String endpoint,
            String p256dh,
            String auth,
            String userId,
            String username,
            String deviceId,
            String deviceLabel,
            String userAgent
    ) {
        Instant now = Instant.now();
        return new StoredPushSubscription(
                endpoint,
                p256dh,
                auth,
                clean(userId),
                clean(username),
                clean(deviceId),
                clean(deviceLabel),
                clean(userAgent),
                now,
                now
        );
    }

    private String clean(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record PushPayload(String title, String body, String url, String tag) {
    }
}
