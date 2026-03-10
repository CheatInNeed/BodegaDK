package dk.bodegadk.server.domain.rooms;

import java.time.Instant;

public record RoomPlayer(
        String playerId,
        String displayName,
        Instant joinedAt
) {
}
