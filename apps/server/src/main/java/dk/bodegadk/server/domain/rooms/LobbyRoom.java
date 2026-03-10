package dk.bodegadk.server.domain.rooms;

import java.time.Instant;
import java.util.List;

public record LobbyRoom(
        String roomCode,
        String hostPlayerId,
        String gameId,
        boolean isPublic,
        RoomStatus status,
        int minPlayers,
        int maxPlayers,
        List<RoomPlayer> players,
        Instant createdAt,
        Instant updatedAt,
        Instant startedAt
) {
    public int currentPlayers() {
        return players.size();
    }
}
