package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.ws.GameWsHandler;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/rooms")
public class RoomController {
    private final InMemoryRuntimeStore runtimeStore;
    private final GameWsHandler gameWsHandler;

    public RoomController(InMemoryRuntimeStore runtimeStore, GameWsHandler gameWsHandler) {
        this.runtimeStore = runtimeStore;
        this.gameWsHandler = gameWsHandler;
    }

    @GetMapping
    public List<RoomListItemResponse> publicRooms() {
        return runtimeStore.publicLobbyRooms().stream()
                .map(room -> new RoomListItemResponse(
                        room.roomCode(),
                        room.hostPlayerId(),
                        room.selectedGame(),
                        room.status(),
                        room.playerCount(),
                        room.participants()
                ))
                .toList();
    }

    @PostMapping
    public CreateRoomResponse createRoom(@RequestBody(required = false) CreateRoomRequest request) {
        String playerId = blank(request == null ? null : request.playerId()) ? "p1" : request.playerId();
        String username = blank(request == null ? null : request.username()) ? null : request.username().trim();
        String token = blank(request == null ? null : request.token()) ? "dev-" + UUID.randomUUID() : request.token();
        boolean isPrivate = request != null && Boolean.TRUE.equals(request.isPrivate());

        String roomCode = runtimeStore.createRoom(request == null ? null : request.gameType(), isPrivate, playerId);
        runtimeStore.joinRoom(roomCode, playerId, username, token);

        return runtimeStore.roomSnapshot(roomCode)
                .map(room -> new CreateRoomResponse(room.roomCode(), playerId, token, room.hostPlayerId(), room.isPrivate(), room.selectedGame(), room.status().name()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Room creation failed"));
    }

    @PostMapping("/{roomCode}/join")
    @ResponseStatus(HttpStatus.OK)
    public JoinRoomResponse joinRoom(@PathVariable String roomCode, @RequestBody(required = false) JoinRoomRequest request) {
        if (!runtimeStore.roomExists(roomCode)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found");
        }

        String playerId = request == null || blank(request.playerId())
                ? "p" + (runtimeStore.participants(roomCode).size() + 1)
                : request.playerId();
        String username = request == null || blank(request.username()) ? null : request.username().trim();

        String token = request == null || blank(request.token())
                ? "dev-" + UUID.randomUUID()
                : request.token();

        // TEAM-DB-INTEGRATION: replace generated dev token/session registration with durable identity/session persistence.
        runtimeStore.joinRoom(roomCode, playerId, username, token);
        gameWsHandler.publishLobbyState(roomCode);

        InMemoryRuntimeStore.RoomSnapshot room = runtimeStore.roomSnapshot(roomCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));

        return new JoinRoomResponse(true, roomCode, playerId, token, room.hostPlayerId(), room.selectedGame(), room.status().name());
    }

    @PostMapping("/{roomCode}/kick")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse kickPlayer(@PathVariable String roomCode, @RequestBody KickPlayerRequest request) {
        if (request == null || blank(request.actorToken()) || blank(request.targetPlayerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "actorToken and targetPlayerId are required");
        }

        try {
            InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.kickPlayer(roomCode, request.actorToken(), request.targetPlayerId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or player not found"));
            gameWsHandler.publishRoomMutation(mutation);
            return new RoomActionResponse(true);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, exception.getMessage());
        }
    }

    @PostMapping("/{roomCode}/leave")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse leaveRoom(@PathVariable String roomCode, @RequestBody LeaveRoomRequest request) {
        if (request == null || blank(request.token())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "token is required");
        }

        InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.leaveRoom(roomCode, request.token())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or session not found"));
        gameWsHandler.publishRoomMutation(mutation);
        return new RoomActionResponse(true);
    }

    @PostMapping("/{roomCode}/visibility")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse updateVisibility(@PathVariable String roomCode, @RequestBody UpdateVisibilityRequest request) {
        if (request == null || blank(request.actorToken())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "actorToken is required");
        }

        try {
            InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.updateVisibility(roomCode, request.actorToken(), request.isPrivate())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or session not found"));
            gameWsHandler.publishRoomMutation(mutation);
            return new RoomActionResponse(true);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, exception.getMessage());
        }
    }

    @PostMapping("/{roomCode}/claim-identity")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse claimIdentity(@PathVariable String roomCode, @RequestBody ClaimIdentityRequest request) {
        if (request == null || blank(request.token()) || blank(request.playerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "token and playerId are required");
        }

        try {
            InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.claimSessionIdentity(
                    roomCode,
                    request.token(),
                    request.playerId(),
                    request.username()
            ).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or session not found"));
            gameWsHandler.publishRoomMutation(mutation);
            return new RoomActionResponse(true);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, exception.getMessage());
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreateRoomRequest(String gameType, Boolean isPrivate, String playerId, String username, String token) {
    }

    public record CreateRoomResponse(
            String roomCode,
            String playerId,
            String token,
            String hostPlayerId,
            boolean isPrivate,
            String selectedGame,
            String status
    ) {
    }

    public record RoomListItemResponse(
            String roomCode,
            String hostPlayerId,
            String selectedGame,
            String status,
            int playerCount,
            List<InMemoryRuntimeStore.PlayerSummary> participants
        ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record JoinRoomRequest(String playerId, String username, String token) {
    }

    public record JoinRoomResponse(
            boolean ok,
            String roomCode,
            String playerId,
            String token,
            String hostPlayerId,
            String selectedGame,
            String status
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KickPlayerRequest(String actorToken, String targetPlayerId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LeaveRoomRequest(String token) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UpdateVisibilityRequest(String actorToken, boolean isPrivate) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ClaimIdentityRequest(String token, String playerId, String username) {
    }

    public record RoomActionResponse(boolean ok) {
    }
}
