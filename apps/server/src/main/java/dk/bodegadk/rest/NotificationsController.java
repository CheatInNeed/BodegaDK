package dk.bodegadk.rest;

import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.runtime.NotificationsStore;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/notifications")
public class NotificationsController {
    private final NotificationsStore notificationsStore;

    public NotificationsController(NotificationsStore notificationsStore) {
        this.notificationsStore = notificationsStore;
    }

    @GetMapping
    public NotificationsStore.NotificationPage notifications(
            Authentication authentication,
            @RequestParam(required = false) Integer limit
    ) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        return notificationsStore.notifications(user.userId(), limit == null ? 20 : limit);
    }

    @PostMapping("/{id}/read")
    public NotificationsStore.NotificationSummary markRead(Authentication authentication, @PathVariable String id) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        validateUuid(id);
        try {
            return notificationsStore.markRead(user.userId(), id);
        } catch (NotificationsStore.NotificationNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        }
    }

    @PostMapping("/read-all")
    public NotificationsReadAllResponse markAllRead(Authentication authentication) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        notificationsStore.markAllRead(user.userId());
        return new NotificationsReadAllResponse(true);
    }

    private void validateUuid(String id) {
        try {
            UUID.fromString(id);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid notification id");
        }
    }

    public record NotificationsReadAllResponse(boolean ok) {
    }
}
