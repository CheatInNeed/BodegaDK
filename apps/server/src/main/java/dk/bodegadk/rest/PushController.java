package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.push.PushProperties;
import dk.bodegadk.push.PushSubscriptionStore;
import dk.bodegadk.push.StoredPushSubscription;
import dk.bodegadk.push.WebPushNotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.NoSuchElementException;

@RestController
@RequestMapping("/push")
public class PushController {
    private final PushProperties pushProperties;
    private final PushSubscriptionStore subscriptionStore;
    private final WebPushNotificationService pushNotificationService;

    public PushController(
            PushProperties pushProperties,
            PushSubscriptionStore subscriptionStore,
            WebPushNotificationService pushNotificationService
    ) {
        this.pushProperties = pushProperties;
        this.subscriptionStore = subscriptionStore;
        this.pushNotificationService = pushNotificationService;
    }

    @GetMapping("/config")
    public PushConfigResponse config() {
        return new PushConfigResponse(
                pushProperties.enabled(),
                pushProperties.enabled() ? pushProperties.getPublicKey() : null
        );
    }

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.OK)
    public PushActionResponse subscribe(@RequestBody SubscribeRequest request) {
        if (request == null || request.subscription() == null || request.subscription().keys() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "subscription is required");
        }
        PushSubscriptionRequest subscription = request.subscription();
        PushKeysRequest keys = subscription.keys();
        if (blank(subscription.endpoint()) || blank(keys.p256dh()) || blank(keys.auth())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endpoint, p256dh, and auth are required");
        }

        StoredPushSubscription stored = pushNotificationService.createStoredSubscription(
                subscription.endpoint(),
                keys.p256dh(),
                keys.auth(),
                request.userId(),
                request.username(),
                request.deviceId(),
                request.deviceLabel(),
                request.userAgent()
        );
        subscriptionStore.upsert(stored);
        return new PushActionResponse(true);
    }

    @PostMapping("/subscriptions/unsubscribe")
    @ResponseStatus(HttpStatus.OK)
    public PushActionResponse unsubscribe(@RequestBody UnsubscribeRequest request) {
        if (request == null || blank(request.endpoint())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endpoint is required");
        }
        subscriptionStore.deleteByEndpoint(request.endpoint());
        return new PushActionResponse(true);
    }

    @PostMapping("/test")
    @ResponseStatus(HttpStatus.OK)
    public PushActionResponse test(@RequestBody TestPushRequest request) {
        if (request == null || blank(request.endpoint())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endpoint is required");
        }
        try {
            pushNotificationService.sendTest(request.endpoint());
            return new PushActionResponse(true);
        } catch (NoSuchElementException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, exception.getMessage());
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    public record PushConfigResponse(boolean enabled, String publicKey) {
    }

    public record PushActionResponse(boolean ok) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SubscribeRequest(
            PushSubscriptionRequest subscription,
            String userId,
            String username,
            String deviceId,
            String deviceLabel,
            String userAgent
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PushSubscriptionRequest(String endpoint, Long expirationTime, PushKeysRequest keys) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PushKeysRequest(String p256dh, String auth) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UnsubscribeRequest(String endpoint, String deviceId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TestPushRequest(String endpoint) {
    }
}
