package dk.bodegadk.runtime;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class InMemoryRoomMetadataStore implements RoomMetadataStore {
    private final ConcurrentMap<String, StoredRoomRecord> rooms = new ConcurrentHashMap<>();
    private final ConcurrentMap<UUID, MatchTicketRecord> tickets = new ConcurrentHashMap<>();

    @Override
    public boolean roomExists(String roomCode) {
        return rooms.containsKey(roomCode);
    }

    @Override
    public void createRoom(String roomCode, String hostUserId, RoomVisibility visibility, String gameType, InMemoryRuntimeStore.RoomStatus status) {
        rooms.put(roomCode, new StoredRoomRecord(roomCode, hostUserId, visibility, gameType, status));
    }

    @Override
    public Optional<StoredRoom> room(String roomCode) {
        StoredRoomRecord record = rooms.get(roomCode);
        if (record == null) {
            return Optional.empty();
        }
        synchronized (record) {
            return Optional.of(record.snapshot());
        }
    }

    @Override
    public List<StoredRoom> publicRooms() {
        return rooms.values().stream()
                .map(record -> {
                    synchronized (record) {
                        return record.visibility.isPrivate() ? null : record.snapshot();
                    }
                })
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(StoredRoom::roomCode))
                .toList();
    }

    @Override
    public void upsertParticipant(String roomCode, String playerId, String username) {
        StoredRoomRecord record = rooms.get(roomCode);
        if (record == null) {
            return;
        }
        synchronized (record) {
            InMemoryRuntimeStore.PlayerSummary participant = new InMemoryRuntimeStore.PlayerSummary(playerId, username);
            int existingIndex = findParticipant(record.participants, playerId);
            if (existingIndex >= 0) {
                record.participants.set(existingIndex, participant);
            } else {
                record.participants.add(participant);
            }
        }
    }

    @Override
    public void removeParticipant(String roomCode, String playerId) {
        StoredRoomRecord record = rooms.get(roomCode);
        if (record == null) {
            return;
        }
        synchronized (record) {
            int existingIndex = findParticipant(record.participants, playerId);
            if (existingIndex >= 0) {
                record.participants.remove(existingIndex);
            }
        }
    }

    @Override
    public void updateRoomHost(String roomCode, String hostPlayerId) {
        StoredRoomRecord record = rooms.get(roomCode);
        if (record == null) {
            return;
        }
        synchronized (record) {
            record.hostPlayerId = hostPlayerId;
        }
    }

    @Override
    public void updateRoomGameType(String roomCode, String gameType) {
        StoredRoomRecord record = rooms.get(roomCode);
        if (record == null) {
            return;
        }
        synchronized (record) {
            record.selectedGame = gameType;
        }
    }

    @Override
    public void updateRoomStatus(String roomCode, InMemoryRuntimeStore.RoomStatus status) {
        StoredRoomRecord record = rooms.get(roomCode);
        if (record == null) {
            return;
        }
        synchronized (record) {
            record.status = status;
        }
    }

    @Override
    public void deleteRoom(String roomCode) {
        rooms.remove(roomCode);
    }

    @Override
    public UUID enqueueTicket(String gameType, String userId, String username, String clientSessionId, int minPlayers, int maxPlayers, boolean strictCount) {
        UUID existingTicketId = tickets.values().stream()
                .filter(record -> record.status == MatchmakingTicketStatus.WAITING)
                .filter(record -> record.userId.equals(userId))
                .sorted(Comparator.comparing(record -> record.createdAt))
                .map(record -> record.ticketId)
                .findFirst()
                .orElse(null);
        if (existingTicketId != null) {
            return existingTicketId;
        }

        UUID ticketId = UUID.randomUUID();
        tickets.put(ticketId, new MatchTicketRecord(ticketId, gameType, userId, username, clientSessionId, MatchmakingTicketStatus.WAITING, null, minPlayers, maxPlayers, strictCount, Instant.now()));
        return ticketId;
    }

    @Override
    public Optional<MatchmakingTicket> ticket(UUID ticketId) {
        MatchTicketRecord record = tickets.get(ticketId);
        return Optional.ofNullable(record == null ? null : record.snapshot());
    }

    @Override
    public List<MatchmakingTicket> waitingTickets(String gameType) {
        return tickets.values().stream()
                .filter(record -> record.status == MatchmakingTicketStatus.WAITING)
                .filter(record -> record.gameType.equalsIgnoreCase(gameType))
                .sorted(Comparator.comparing(record -> record.createdAt))
                .map(MatchTicketRecord::snapshot)
                .toList();
    }

    @Override
    public void markTicketMatched(UUID ticketId, String roomCode) {
        MatchTicketRecord record = tickets.get(ticketId);
        if (record == null) {
            return;
        }
        record.status = MatchmakingTicketStatus.MATCHED;
        record.roomCode = roomCode;
    }

    @Override
    public void cancelTicket(UUID ticketId) {
        MatchTicketRecord record = tickets.get(ticketId);
        if (record == null) {
            return;
        }
        record.status = MatchmakingTicketStatus.CANCELLED;
    }

    @Override
    public void updateRoomVisibility(String roomCode, RoomVisibility visibility) {
        StoredRoomRecord record = rooms.get(roomCode);
        if (record == null) {
            return;
        }
        synchronized (record) {
            record.visibility = visibility;
        }
    }

    @Override
    public void markRoomAbandoned(String roomCode) {
        updateRoomStatus(roomCode, InMemoryRuntimeStore.RoomStatus.ABANDONED);
    }

    private int findParticipant(List<InMemoryRuntimeStore.PlayerSummary> participants, String playerId) {
        for (int index = 0; index < participants.size(); index += 1) {
            if (participants.get(index).playerId().equals(playerId)) {
                return index;
            }
        }
        return -1;
    }

    private static final class StoredRoomRecord {
        private final String roomCode;
        private String hostPlayerId;
        private RoomVisibility visibility;
        private String selectedGame;
        private InMemoryRuntimeStore.RoomStatus status;
        private final List<InMemoryRuntimeStore.PlayerSummary> participants = new ArrayList<>();

        private StoredRoomRecord(String roomCode, String hostPlayerId, RoomVisibility visibility, String selectedGame, InMemoryRuntimeStore.RoomStatus status) {
            this.roomCode = roomCode;
            this.hostPlayerId = hostPlayerId;
            this.visibility = visibility;
            this.selectedGame = selectedGame;
            this.status = status;
        }

        private StoredRoom snapshot() {
            return new StoredRoom(roomCode, hostPlayerId, visibility, selectedGame, status, List.copyOf(participants));
        }
    }

    private static final class MatchTicketRecord {
        private final UUID ticketId;
        private final String gameType;
        private final String userId;
        private final String username;
        private final String clientSessionId;
        private MatchmakingTicketStatus status;
        private String roomCode;
        private final int minPlayers;
        private final int maxPlayers;
        private final boolean strictCount;
        private final Instant createdAt;

        private MatchTicketRecord(UUID ticketId, String gameType, String userId, String username, String clientSessionId, MatchmakingTicketStatus status, String roomCode, int minPlayers, int maxPlayers, boolean strictCount, Instant createdAt) {
            this.ticketId = ticketId;
            this.gameType = gameType;
            this.userId = userId;
            this.username = username;
            this.clientSessionId = clientSessionId;
            this.status = status;
            this.roomCode = roomCode;
            this.minPlayers = minPlayers;
            this.maxPlayers = maxPlayers;
            this.strictCount = strictCount;
            this.createdAt = createdAt;
        }

        private MatchmakingTicket snapshot() {
            return new MatchmakingTicket(ticketId, gameType, userId, username, clientSessionId, status, roomCode, minPlayers, maxPlayers, strictCount, createdAt);
        }
    }
}
