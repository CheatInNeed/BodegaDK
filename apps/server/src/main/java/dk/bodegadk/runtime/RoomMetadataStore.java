package dk.bodegadk.runtime;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoomMetadataStore {
    boolean roomExists(String roomCode);

    void createRoom(String roomCode, String hostPlayerId, boolean isPrivate, String gameType, InMemoryRuntimeStore.RoomStatus status);

    Optional<StoredRoom> room(String roomCode);

    List<StoredRoom> publicRooms();

    void upsertParticipant(String roomCode, String playerId, String username);

    void removeParticipant(String roomCode, String playerId);

    void updateRoomHost(String roomCode, String hostPlayerId);

    void updateRoomGameType(String roomCode, String gameType);

    void updateRoomStatus(String roomCode, InMemoryRuntimeStore.RoomStatus status);

    void deleteRoom(String roomCode);

    UUID enqueueTicket(String gameType, String playerId, String username, String token, int minPlayers, int maxPlayers, boolean strictCount);

    Optional<MatchmakingTicket> ticket(UUID ticketId);

    List<MatchmakingTicket> waitingTickets(String gameType);

    void markTicketMatched(UUID ticketId, String roomCode);

    void cancelTicket(UUID ticketId);

    record StoredRoom(
            String roomCode,
            String hostPlayerId,
            boolean isPrivate,
            String selectedGame,
            InMemoryRuntimeStore.RoomStatus status,
            List<InMemoryRuntimeStore.PlayerSummary> participants
    ) {
    }

    record MatchmakingTicket(
            UUID ticketId,
            String gameType,
            String playerId,
            String username,
            String token,
            MatchmakingTicketStatus status,
            String roomCode,
            int minPlayers,
            int maxPlayers,
            boolean strictCount,
            Instant createdAt
    ) {
    }

    enum MatchmakingTicketStatus {
        WAITING,
        MATCHED,
        CANCELLED
    }
}
