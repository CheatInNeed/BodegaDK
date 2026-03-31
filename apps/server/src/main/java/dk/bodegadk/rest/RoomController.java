package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.ws.GameWsHandler;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
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
    public CreateRoomResponse createRoom(
            JwtAuthenticationToken authentication,
            @RequestBody(required = false) CreateRoomRequest request
    ) {
        String playerId = authenticatedUserId(authentication);
        String token = blank(request == null ? null : request.token()) ? "dev-" + UUID.randomUUID() : request.token();
        boolean isPrivate = request != null && Boolean.TRUE.equals(request.isPrivate());

        String roomCode = runtimeStore.createRoom(request == null ? null : request.gameType(), isPrivate, playerId);
        runtimeStore.joinRoom(roomCode, playerId, token, playerId);

        return runtimeStore.roomSnapshot(roomCode)
                .map(room -> new CreateRoomResponse(room.roomCode(), playerId, token, room.hostPlayerId(), room.isPrivate(), room.selectedGame(), room.status().name()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Room creation failed"));
    }

    @PostMapping("/{roomCode}/join")
    @ResponseStatus(HttpStatus.OK)
    public JoinRoomResponse joinRoom(
            JwtAuthenticationToken authentication,
            @PathVariable String roomCode,
            @RequestBody(required = false) JoinRoomRequest request
    ) {
        if (!runtimeStore.roomExists(roomCode)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found");
        }

        String playerId = authenticatedUserId(authentication);
        String token = request == null || blank(request.token())
                ? "dev-" + UUID.randomUUID()
                : request.token();

        runtimeStore.joinRoom(roomCode, playerId, token, playerId);
        gameWsHandler.publishLobbyState(roomCode);

        InMemoryRuntimeStore.RoomSnapshot room = runtimeStore.roomSnapshot(roomCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));

        return new JoinRoomResponse(true, roomCode, playerId, token, room.hostPlayerId(), room.selectedGame(), room.status().name());
    }

    @PostMapping("/{roomCode}/kick")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse kickPlayer(
            JwtAuthenticationToken authentication,
            @PathVariable String roomCode,
            @RequestBody KickPlayerRequest request
    ) {
        if (request == null || blank(request.actorToken()) || blank(request.targetPlayerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "actorToken and targetPlayerId are required");
        }

        try {
            InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.kickPlayer(
                            roomCode,
                            request.actorToken(),
                            request.targetPlayerId(),
                            authenticatedUserId(authentication)
                    )
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or player not found"));
            gameWsHandler.publishRoomMutation(mutation);
            return new RoomActionResponse(true);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, exception.getMessage());
        }
    }

    @PostMapping("/{roomCode}/leave")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse leaveRoom(
            JwtAuthenticationToken authentication,
            @PathVariable String roomCode,
            @RequestBody LeaveRoomRequest request
    ) {
        if (request == null || blank(request.token())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "token is required");
        }

        InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.leaveRoom(roomCode, request.token(), authenticatedUserId(authentication))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or session not found"));
        gameWsHandler.publishRoomMutation(mutation);
        return new RoomActionResponse(true);
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private String authenticatedUserId(JwtAuthenticationToken authentication) {
        String subject = authentication.getToken().getSubject();
        if (blank(subject)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT subject is required");
        }

        try {
            return UUID.fromString(subject).toString();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT subject must be a valid UUID");
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreateRoomRequest(String gameType, Boolean isPrivate, String playerId, String token) {
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
            List<String> participants
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record JoinRoomRequest(String playerId, String token) {
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

    public record RoomActionResponse(boolean ok) {
    }
}
