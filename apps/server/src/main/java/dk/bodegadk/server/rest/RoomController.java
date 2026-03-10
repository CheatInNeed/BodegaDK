package dk.bodegadk.server.rest;

import dk.bodegadk.server.domain.rooms.GameCatalog;
import dk.bodegadk.server.domain.rooms.LobbyRoom;
import dk.bodegadk.server.domain.rooms.RoomPlayer;
import dk.bodegadk.server.domain.rooms.RoomService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private final RoomService roomService;
    private final GameCatalog gameCatalog;

    public RoomController(RoomService roomService, GameCatalog gameCatalog) {
        this.roomService = roomService;
        this.gameCatalog = gameCatalog;
    }

    @GetMapping("/games")
    public List<GameCatalog.GameSummary> listGames() {
        return gameCatalog.list().stream().toList();
    }

    @PostMapping
    public RoomResponse createRoom(@RequestBody CreateRoomRequest request) {
        LobbyRoom room = roomService.createRoom(
                new RoomService.CreateRoomCommand(request.playerId(), request.displayName(), request.gameId(), request.isPublic())
        );
        return RoomResponse.from(room);
    }

    @GetMapping
    public List<RoomSummaryResponse> listPublicRooms() {
        return roomService.listPublicWaitingRooms().stream()
                .map(RoomSummaryResponse::from)
                .toList();
    }

    @GetMapping("/{roomCode}")
    public RoomResponse getRoom(@PathVariable String roomCode) {
        return RoomResponse.from(roomService.getRoom(roomCode));
    }

    @PostMapping("/{roomCode}/join")
    public RoomResponse joinRoom(@PathVariable String roomCode, @RequestBody JoinRoomRequest request) {
        LobbyRoom room = roomService.joinRoom(
                roomCode,
                new RoomService.JoinRoomCommand(request.playerId(), request.displayName())
        );
        return RoomResponse.from(room);
    }

    @PatchMapping("/{roomCode}")
    public RoomResponse updateRoom(@PathVariable String roomCode, @RequestBody UpdateRoomRequest request) {
        LobbyRoom room = roomService.updateRoom(
                roomCode,
                new RoomService.UpdateRoomCommand(request.actorPlayerId(), request.isPublic(), request.kickPlayerId())
        );
        return RoomResponse.from(room);
    }

    @PostMapping("/{roomCode}/start")
    public RoomResponse startRoom(@PathVariable String roomCode, @RequestBody StartRoomRequest request) {
        return RoomResponse.from(roomService.startRoom(roomCode, request.actorPlayerId()));
    }

    public record CreateRoomRequest(String playerId, String displayName, String gameId, boolean isPublic) {}
    public record JoinRoomRequest(String playerId, String displayName) {}
    public record UpdateRoomRequest(String actorPlayerId, Boolean isPublic, String kickPlayerId) {}
    public record StartRoomRequest(String actorPlayerId) {}

    public record RoomPlayerResponse(String playerId, String displayName, boolean host) {
        public static RoomPlayerResponse from(RoomPlayer player, String hostPlayerId) {
            return new RoomPlayerResponse(player.playerId(), player.displayName(), player.playerId().equals(hostPlayerId));
        }
    }

    public record RoomSummaryResponse(
            String roomCode,
            String gameId,
            boolean isPublic,
            String status,
            String hostPlayerId,
            int minPlayers,
            int maxPlayers,
            int currentPlayers
    ) {
        public static RoomSummaryResponse from(LobbyRoom room) {
            return new RoomSummaryResponse(
                    room.roomCode(),
                    room.gameId(),
                    room.isPublic(),
                    room.status().name(),
                    room.hostPlayerId(),
                    room.minPlayers(),
                    room.maxPlayers(),
                    room.currentPlayers()
            );
        }
    }

    public record RoomResponse(
            String roomCode,
            String hostPlayerId,
            String gameId,
            boolean isPublic,
            String status,
            int minPlayers,
            int maxPlayers,
            int currentPlayers,
            List<RoomPlayerResponse> players
    ) {
        public static RoomResponse from(LobbyRoom room) {
            return new RoomResponse(
                    room.roomCode(),
                    room.hostPlayerId(),
                    room.gameId(),
                    room.isPublic(),
                    room.status().name(),
                    room.minPlayers(),
                    room.maxPlayers(),
                    room.currentPlayers(),
                    room.players().stream().map(player -> RoomPlayerResponse.from(player, room.hostPlayerId())).toList()
            );
        }
    }
}
