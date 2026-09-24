package dk.bodegadk.runtime;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoomMetadataStore {
    boolean roomExists(String roomCode);

    void createRoom(String roomCode, String hostUserId, RoomVisibility visibility, String gameType, InMemoryRuntimeStore.RoomStatus status);

    Optional<StoredRoom> room(String roomCode);

    List<StoredRoom> publicRooms();

    void upsertParticipant(String roomCode, String userId, String username);

    void removeParticipant(String roomCode, String userId);

    void updateRoomHost(String roomCode, String hostUserId);

    void updateRoomGameType(String roomCode, String gameType);

    void updateRoomVisibility(String roomCode, RoomVisibility visibility);

    void updateRoomStatus(String roomCode, InMemoryRuntimeStore.RoomStatus status);

    void deleteRoom(String roomCode);

    UUID enqueueTicket(String gameType, String userId, String username, String clientSessionId, int minPlayers, int maxPlayers, boolean strictCount);

    Optional<MatchmakingTicket> ticket(UUID ticketId);

    List<MatchmakingTicket> waitingTickets(String gameType);

    void markTicketMatched(UUID ticketId, String roomCode);

    void cancelTicket(UUID ticketId);

    void markRoomAbandoned(String roomCode);

    enum RoomVisibility {
        PUBLIC,
        PRIVATE,
        FRIENDS_ONLY;

        public static RoomVisibility fromPrivateFlag(boolean isPrivate) {
            return isPrivate ? PRIVATE : PUBLIC;
        }

        public boolean isPrivate() {
            return this != PUBLIC;
        }
    }

    record StoredRoom(
            String roomCode,
            String hostUserId,
            RoomVisibility visibility,
            String selectedGame,
            InMemoryRuntimeStore.RoomStatus status,
            List<InMemoryRuntimeStore.PlayerSummary> participants
    ) {
        public String hostPlayerId() {
            return hostUserId;
        }

        public boolean isPrivate() {
            return visibility.isPrivate();
        }
    }

    record MatchmakingTicket(
            UUID ticketId,
            String gameType,
            String userId,
            String username,
            String clientSessionId,
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
        CANCELLED,
        EXPIRED
    }
}
