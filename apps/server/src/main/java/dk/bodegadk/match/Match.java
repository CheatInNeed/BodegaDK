package dk.bodegadk.match;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record Match(
        UUID id,
        String gameType,
        MatchMode mode,
        MatchStatus status,
        Instant startedAt,
        Instant endedAt,
        List<MatchParticipant> participants
) {
    public Match {
        participants = List.copyOf(participants);
    }
}
