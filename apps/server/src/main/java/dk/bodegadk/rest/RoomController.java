package dk.bodegadk.rest;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/rooms")
public class RoomController {
    private final InMemoryRuntimeStore runtimeStore;

    public RoomController(InMemoryRuntimeStore runtimeStore) {
        this.runtimeStore = runtimeStore;
    }

    @PostMapping
    public CreateRoomResponse createRoom(@RequestBody(required = false) CreateRoomRequest request) {
        String roomCode = runtimeStore.createRoom(request == null ? null : request.gameType());
        return new CreateRoomResponse(roomCode);
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

        String token = request == null || blank(request.token())
                ? "dev-" + UUID.randomUUID()
                : request.token();

        // TEAM-DB-INTEGRATION: replace generated dev token/session registration with durable identity/session persistence.
        runtimeStore.joinRoom(roomCode, playerId, token);

        return new JoinRoomResponse(true);
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreateRoomRequest(String gameType) {
    }

    public record CreateRoomResponse(String roomCode) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record JoinRoomRequest(String playerId, String token) {
    }

    public record JoinRoomResponse(boolean ok) {
    }
}
