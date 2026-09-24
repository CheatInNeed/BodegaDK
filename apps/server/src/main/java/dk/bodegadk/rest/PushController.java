package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.push.PushProperties;
import dk.bodegadk.push.PushSubscriptionStore;
import dk.bodegadk.push.StoredPushSubscription;
import dk.bodegadk.push.WebPushNotificationService;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
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
    public PushActionResponse subscribe(Authentication authentication, @RequestBody SubscribeRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
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
                user.userId(),
                request.username(),
                request.deviceId(),
                request.deviceLabel(),
                request.userAgent()
        );
        try {
            subscriptionStore.upsert(stored);
        } catch (DataAccessException exception) {
            throw pushStorageUnavailable(exception);
        }
        return new PushActionResponse(true);
    }

    @PostMapping("/subscriptions/unsubscribe")
    @ResponseStatus(HttpStatus.OK)
    public PushActionResponse unsubscribe(Authentication authentication, @RequestBody UnsubscribeRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        if (request == null || blank(request.endpoint())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endpoint is required");
        }
        StoredPushSubscription subscription;
        try {
            subscription = subscriptionStore.findActiveByEndpoint(request.endpoint())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Push subscription not found"));
        } catch (DataAccessException exception) {
            throw pushStorageUnavailable(exception);
        }
        if (!user.userId().equals(subscription.userId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Push subscription not found");
        }
        try {
            subscriptionStore.deleteByEndpoint(request.endpoint());
        } catch (DataAccessException exception) {
            throw pushStorageUnavailable(exception);
        }
        return new PushActionResponse(true);
    }

    @PostMapping("/test")
    @ResponseStatus(HttpStatus.OK)
    public PushActionResponse test(Authentication authentication, @RequestBody TestPushRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        if (request == null || blank(request.endpoint())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "endpoint is required");
        }
        try {
            StoredPushSubscription subscription;
            try {
                subscription = subscriptionStore.findActiveByEndpoint(request.endpoint())
                        .orElseThrow(() -> new NoSuchElementException("Push subscription not found"));
            } catch (DataAccessException exception) {
                throw pushStorageUnavailable(exception);
            }
            if (!user.userId().equals(subscription.userId())) {
                throw new NoSuchElementException("Push subscription not found");
            }
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

    private ResponseStatusException pushStorageUnavailable(DataAccessException exception) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Push subscription storage is unavailable. Check the database credentials and connectivity.",
                exception
        );
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
