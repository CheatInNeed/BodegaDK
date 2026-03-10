package dk.bodegadk.server.domain.rooms;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Random;

@Service
public class RoomService {
    private static final String ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final RoomRepository roomRepository;
    private final GameCatalog gameCatalog;
    private final ActiveGameRegistry activeGameRegistry;
    private final Random random = new Random();

    public RoomService(RoomRepository roomRepository, GameCatalog gameCatalog, ActiveGameRegistry activeGameRegistry) {
        this.roomRepository = roomRepository;
        this.gameCatalog = gameCatalog;
        this.activeGameRegistry = activeGameRegistry;
    }

    @Transactional
    public LobbyRoom createRoom(CreateRoomCommand command) {
        String playerId = requireText(command.playerId(), "playerId");
        String displayName = normalizeDisplayName(command.displayName(), playerId);
        GameCatalog.GameSummary game = gameCatalog.requireSummary(command.gameId());
        String roomCode = generateRoomCode();

        roomRepository.createRoom(
                roomCode,
                playerId,
                game.gameId(),
                command.isPublic(),
                RoomStatus.WAITING,
                game.minPlayers(),
                game.maxPlayers(),
                displayName
        );

        return getRoom(roomCode);
    }

    public List<LobbyRoom> listPublicWaitingRooms() {
        return roomRepository.findPublicWaitingRooms();
    }

    public LobbyRoom getRoom(String roomCode) {
        return roomRepository.findRoom(normalizeRoomCode(roomCode))
                .orElseThrow(() -> new RoomNotFoundException("Room not found: " + roomCode));
    }

    @Transactional
    public LobbyRoom joinRoom(String roomCode, JoinRoomCommand command) {
        LobbyRoom room = getRoom(roomCode);
        String playerId = requireText(command.playerId(), "playerId");
        String displayName = normalizeDisplayName(command.displayName(), playerId);

        if (roomRepository.playerExists(room.roomCode(), playerId)) {
            roomRepository.addPlayer(room.roomCode(), playerId, displayName);
            return getRoom(room.roomCode());
        }

        if (room.status() == RoomStatus.PLAYING) {
            throw new RoomConflictException("This lobby is already playing. Joining as an active player is blocked.");
        }

        if (room.currentPlayers() >= room.maxPlayers()) {
            throw new RoomConflictException("Lobby is full.");
        }

        roomRepository.addPlayer(room.roomCode(), playerId, displayName);
        return getRoom(room.roomCode());
    }

    @Transactional
    public LobbyRoom updateRoom(String roomCode, UpdateRoomCommand command) {
        LobbyRoom room = getRoom(roomCode);
        String actorPlayerId = requireText(command.actorPlayerId(), "actorPlayerId");
        assertHost(room, actorPlayerId);

        if (command.isPublic() != null) {
            roomRepository.updateVisibility(room.roomCode(), command.isPublic());
        }

        if (command.kickPlayerId() != null && !command.kickPlayerId().isBlank()) {
            if (Objects.equals(command.kickPlayerId(), room.hostPlayerId())) {
                throw new RoomConflictException("Host cannot kick themselves.");
            }
            if (!roomRepository.playerExists(room.roomCode(), command.kickPlayerId())) {
                throw new RoomConflictException("Player is not in this lobby.");
            }
            roomRepository.removePlayer(room.roomCode(), command.kickPlayerId());
        }

        return getRoom(room.roomCode());
    }

    @Transactional
    public LobbyRoom startRoom(String roomCode, String actorPlayerId) {
        LobbyRoom room = getRoom(roomCode);
        assertHost(room, requireText(actorPlayerId, "actorPlayerId"));

        if (room.status() != RoomStatus.WAITING) {
            throw new RoomConflictException("Lobby cannot be started from status " + room.status());
        }
        if (room.currentPlayers() < room.minPlayers()) {
            throw new RoomConflictException("Need at least " + room.minPlayers() + " players to start.");
        }

        roomRepository.updateStatus(room.roomCode(), RoomStatus.PLAYING, Instant.now());
        LobbyRoom started = getRoom(room.roomCode());
        activeGameRegistry.start(started);
        return started;
    }

    @Transactional
    public void markFinished(String roomCode) {
        LobbyRoom room = getRoom(roomCode);
        if (room.status() != RoomStatus.FINISHED) {
            roomRepository.updateStatus(room.roomCode(), RoomStatus.FINISHED, room.startedAt());
        }
    }

    public void assertPlayerInRoom(String roomCode, String playerId) {
        LobbyRoom room = getRoom(roomCode);
        if (!roomRepository.playerExists(room.roomCode(), playerId)) {
            throw new RoomConflictException("Player is not a member of this room.");
        }
    }

    public boolean hasActiveGame(String roomCode) {
        return activeGameRegistry.hasGame(normalizeRoomCode(roomCode));
    }

    public ActiveGameRegistry.Snapshot connectToGame(String roomCode, String playerId) {
        assertPlayerInRoom(roomCode, playerId);
        LobbyRoom room = getRoom(roomCode);
        if (room.status() != RoomStatus.PLAYING) {
            throw new RoomConflictException("Room is not in PLAYING state.");
        }
        return activeGameRegistry.connect(room.roomCode(), playerId);
    }

    public ActiveGameRegistry.UpdateResult applyGameAction(String roomCode, String playerId, String type, java.util.Map<String, Object> payload) {
        assertPlayerInRoom(roomCode, playerId);
        LobbyRoom room = getRoom(roomCode);
        if (room.status() != RoomStatus.PLAYING) {
            throw new RoomConflictException("Room is not in PLAYING state.");
        }
        ActiveGameRegistry.UpdateResult result = activeGameRegistry.applyAction(room.roomCode(), playerId, type, payload);
        if (result.winnerPlayerId() != null) {
            markFinished(room.roomCode());
        }
        return result;
    }

    private void assertHost(LobbyRoom room, String actorPlayerId) {
        if (!room.hostPlayerId().equals(actorPlayerId)) {
            throw new RoomConflictException("Only the host may perform this action.");
        }
    }

    private String generateRoomCode() {
        for (int attempt = 0; attempt < 30; attempt++) {
            StringBuilder code = new StringBuilder();
            for (int i = 0; i < 6; i++) {
                code.append(ROOM_ALPHABET.charAt(random.nextInt(ROOM_ALPHABET.length())));
            }
            String candidate = code.toString();
            if (roomRepository.findRoom(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new RoomConflictException("Could not generate a unique room code.");
    }

    private String normalizeRoomCode(String roomCode) {
        return requireText(roomCode, "roomCode").toUpperCase(Locale.ROOT);
    }

    private String requireText(String value, String fieldName) {
        if (value == null || value.trim().isEmpty()) {
            throw new RoomConflictException("Missing required field: " + fieldName);
        }
        return value.trim();
    }

    private String normalizeDisplayName(String displayName, String fallbackPlayerId) {
        if (displayName == null || displayName.trim().isEmpty()) {
            return fallbackPlayerId;
        }
        return displayName.trim();
    }

    public record CreateRoomCommand(String playerId, String displayName, String gameId, boolean isPublic) {}
    public record JoinRoomCommand(String playerId, String displayName) {}
    public record UpdateRoomCommand(String actorPlayerId, Boolean isPublic, String kickPlayerId) {}

    public static class RoomNotFoundException extends RuntimeException {
        public RoomNotFoundException(String message) {
            super(message);
        }
    }

    public static class RoomConflictException extends RuntimeException {
        public RoomConflictException(String message) {
            super(message);
        }
    }
}
