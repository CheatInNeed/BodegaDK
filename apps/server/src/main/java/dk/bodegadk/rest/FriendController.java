package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.social.FriendRequest;
import dk.bodegadk.social.FriendRequestService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/friends")
public class FriendController {
    private final FriendRequestService friendRequestService;

    public FriendController(FriendRequestService friendRequestService) {
        this.friendRequestService = friendRequestService;
    }

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public FriendRequestResponse sendRequest(@RequestBody FriendRequestCreateRequest request) {
        if (request == null || blank(request.senderUserId()) || blank(request.recipientUserId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "senderUserId and recipientUserId are required");
        }
        if (request.senderUserId().equals(request.recipientUserId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot send a friend request to yourself");
        }

        FriendRequestService.FriendRequestResult result = friendRequestService.sendFriendRequest(
                request.senderUserId().trim(),
                request.senderUsername(),
                request.recipientUserId().trim()
        );
        FriendRequest friendRequest = result.request();
        return new FriendRequestResponse(
                true,
                friendRequest.id().toString(),
                friendRequest.senderUserId(),
                friendRequest.senderUsername(),
                friendRequest.recipientUserId(),
                friendRequest.status().name(),
                result.notifiedDevices()
        );
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FriendRequestCreateRequest(String senderUserId, String senderUsername, String recipientUserId) {
    }

    public record FriendRequestResponse(
            boolean ok,
            String requestId,
            String senderUserId,
            String senderUsername,
            String recipientUserId,
            String status,
            int notifiedDevices
    ) {
    }
}
