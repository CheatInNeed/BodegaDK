package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.auth.AuthSupport;
import dk.bodegadk.auth.AuthenticatedUser;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.runtime.MatchmakingService;
import dk.bodegadk.runtime.RoomMetadataStore;
import dk.bodegadk.ws.GameWsHandler;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/rooms")
public class RoomController {
    private final InMemoryRuntimeStore runtimeStore;
    private final RoomMetadataStore roomMetadataStore;
    private final GameWsHandler gameWsHandler;

    public RoomController(InMemoryRuntimeStore runtimeStore, RoomMetadataStore roomMetadataStore, GameWsHandler gameWsHandler) {
        this.runtimeStore = runtimeStore;
        this.roomMetadataStore = roomMetadataStore;
        this.gameWsHandler = gameWsHandler;
    }

    @GetMapping
    public List<RoomListItemResponse> publicRooms() {
        return roomMetadataStore.publicRooms().stream()
                .map(room -> new RoomListItemResponse(
                        room.roomCode(),
                        room.hostPlayerId(),
                        room.selectedGame(),
                        room.status().name(),
                        room.participants().size(),
                        room.participants()
                ))
                .toList();
    }

    @PostMapping
    public CreateRoomResponse createRoom(Authentication authentication, @RequestBody(required = false) CreateRoomRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        String playerId = user.userId();
        String username = blank(request == null ? null : request.username()) ? null : request.username().trim();
        boolean isPrivate = request != null && Boolean.TRUE.equals(request.isPrivate());
        String normalizedGame = request == null ? null : request.gameType();

        String roomCode;
        do {
            roomCode = runtimeStore.generateRoomCode();
        } while (roomMetadataStore.roomExists(roomCode));
        roomMetadataStore.createRoom(
                roomCode,
                playerId,
                RoomMetadataStore.RoomVisibility.fromPrivateFlag(isPrivate),
                normalizedGame,
                InMemoryRuntimeStore.RoomStatus.LOBBY
        );
        runtimeStore.mirrorRoom(roomCode, normalizedGame, isPrivate, playerId, InMemoryRuntimeStore.RoomStatus.LOBBY);
        String token = MatchmakingService.runtimeToken(roomCode, playerId);
        runtimeStore.joinRoom(roomCode, playerId, username, token);
        roomMetadataStore.upsertParticipant(roomCode, playerId, username);

        return runtimeStore.roomSnapshot(roomCode)
                .map(room -> new CreateRoomResponse(room.roomCode(), playerId, room.hostPlayerId(), room.isPrivate(), room.selectedGame(), room.status().name()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Room creation failed"));
    }

    @PostMapping("/{roomCode}/join")
    @ResponseStatus(HttpStatus.OK)
    public JoinRoomResponse joinRoom(Authentication authentication, @PathVariable String roomCode, @RequestBody(required = false) JoinRoomRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        RoomMetadataStore.StoredRoom stored = roomMetadataStore.room(roomCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));
        if (stored.status() != InMemoryRuntimeStore.RoomStatus.LOBBY) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Room is not joinable");
        }
        if (!runtimeStore.roomExists(roomCode)) {
            hydrateRuntimeRoom(stored);
        }
        if (!runtimeStore.roomExists(roomCode)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found");
        }

        String playerId = user.userId();
        String username = request == null || blank(request.username()) ? null : request.username().trim();
        String token = MatchmakingService.runtimeToken(roomCode, playerId);

        runtimeStore.joinRoom(roomCode, playerId, username, token);
        roomMetadataStore.upsertParticipant(roomCode, playerId, username);
        gameWsHandler.publishLobbyState(roomCode);

        InMemoryRuntimeStore.RoomSnapshot room = runtimeStore.roomSnapshot(roomCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));

        return new JoinRoomResponse(true, roomCode, playerId, room.hostPlayerId(), room.selectedGame(), room.status().name());
    }

    @PostMapping("/{roomCode}/kick")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse kickPlayer(Authentication authentication, @PathVariable String roomCode, @RequestBody KickPlayerRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        if (request == null || blank(request.targetPlayerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "targetPlayerId is required");
        }

        try {
            InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.kickPlayer(roomCode, MatchmakingService.runtimeToken(roomCode, user.userId()), request.targetPlayerId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or player not found"));
            roomMetadataStore.removeParticipant(roomCode, request.targetPlayerId());
            gameWsHandler.publishRoomMutation(mutation);
            return new RoomActionResponse(true);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, exception.getMessage());
        }
    }

    @PostMapping("/{roomCode}/leave")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse leaveRoom(Authentication authentication, @PathVariable String roomCode, @RequestBody(required = false) LeaveRoomRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);

        InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.leaveRoom(roomCode, MatchmakingService.runtimeToken(roomCode, user.userId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or session not found"));
        roomMetadataStore.removeParticipant(roomCode, user.userId());
        gameWsHandler.publishRoomMutation(mutation);
        return new RoomActionResponse(true);
    }

    @PostMapping("/{roomCode}/visibility")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse updateVisibility(Authentication authentication, @PathVariable String roomCode, @RequestBody UpdateVisibilityRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);

        try {
            InMemoryRuntimeStore.RoomMutation mutation = runtimeStore.updateVisibility(roomCode, MatchmakingService.runtimeToken(roomCode, user.userId()), request.isPrivate())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room or session not found"));
            roomMetadataStore.updateRoomVisibility(roomCode, RoomMetadataStore.RoomVisibility.fromPrivateFlag(request.isPrivate()));
            gameWsHandler.publishRoomMutation(mutation);
            return new RoomActionResponse(true);
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, exception.getMessage());
        }
    }

    @PostMapping("/{roomCode}/claim-identity")
    @ResponseStatus(HttpStatus.OK)
    public RoomActionResponse claimIdentity(Authentication authentication, @PathVariable String roomCode, @RequestBody ClaimIdentityRequest request) {
        AuthenticatedUser user = AuthSupport.requireUser(authentication);
        String username = request == null || blank(request.username()) ? null : request.username().trim();
        roomMetadataStore.upsertParticipant(roomCode, user.userId(), username);
        gameWsHandler.publishLobbyState(roomCode);
        return new RoomActionResponse(true);
    }

    private void hydrateRuntimeRoom(RoomMetadataStore.StoredRoom stored) {
        runtimeStore.mirrorRoom(stored.roomCode(), stored.selectedGame(), stored.isPrivate(), stored.hostPlayerId(), stored.status());
        for (InMemoryRuntimeStore.PlayerSummary participant : stored.participants()) {
            runtimeStore.joinRoom(
                    stored.roomCode(),
                    participant.playerId(),
                    participant.username(),
                    MatchmakingService.runtimeToken(stored.roomCode(), participant.playerId())
            );
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreateRoomRequest(String gameType, Boolean isPrivate, String username) {
    }

    public record CreateRoomResponse(
            String roomCode,
            String playerId,
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
    public record JoinRoomRequest(String username) {
    }

    public record JoinRoomResponse(
            boolean ok,
            String roomCode,
            String playerId,
            String hostPlayerId,
            String selectedGame,
            String status
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KickPlayerRequest(String targetPlayerId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LeaveRoomRequest() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UpdateVisibilityRequest(boolean isPrivate) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ClaimIdentityRequest(String username) {
    }

    public record RoomActionResponse(boolean ok) {
    }
}
