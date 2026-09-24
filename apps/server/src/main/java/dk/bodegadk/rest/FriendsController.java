package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.runtime.FriendsStore;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/friends")
public class FriendsController {
    private final FriendsStore friendsStore;

    public FriendsController(FriendsStore friendsStore) {
        this.friendsStore = friendsStore;
    }

    @GetMapping
    public List<FriendsStore.FriendshipSummary> friends(Authentication authentication) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        return friendsStore.acceptedFriends(user.userId());
    }

    @GetMapping("/requests")
    public FriendsStore.FriendRequestPage requests(Authentication authentication) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        return friendsStore.pendingRequests(user.userId());
    }

    @PostMapping("/request")
    public FriendsStore.FriendshipSummary request(Authentication authentication, @RequestBody FriendRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        if (request == null || request.username() == null || request.username().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "username is required");
        }
        try {
            return friendsStore.sendRequest(user.userId(), request.username());
        } catch (FriendsStore.SelfFriendshipException | IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
        } catch (FriendsStore.FriendNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        } catch (FriendsStore.DuplicateFriendshipException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    @PostMapping("/{id}/accept")
    public FriendsStore.FriendshipSummary accept(Authentication authentication, @PathVariable String id) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        return updateRequest(user.userId(), id, true);
    }

    @PostMapping("/{id}/decline")
    public FriendsStore.FriendshipSummary decline(Authentication authentication, @PathVariable String id) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        return updateRequest(user.userId(), id, false);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(Authentication authentication, @PathVariable String id) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        validateUuid(id);
        try {
            friendsStore.remove(user.userId(), id);
        } catch (FriendsStore.FriendNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        }
    }

    private FriendsStore.FriendshipSummary updateRequest(String userId, String id, boolean accept) {
        validateUuid(id);
        try {
            return accept
                    ? friendsStore.acceptRequest(userId, id)
                    : friendsStore.declineRequest(userId, id);
        } catch (FriendsStore.FriendNotFoundException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        }
    }

    private void validateUuid(String id) {
        try {
            UUID.fromString(id);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid friendship id");
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FriendRequest(String username) {
    }
}
