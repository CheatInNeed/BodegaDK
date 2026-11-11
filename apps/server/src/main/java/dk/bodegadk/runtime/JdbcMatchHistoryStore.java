package dk.bodegadk.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dk.bodegadk.match.Match;
import dk.bodegadk.match.MatchMode;
import dk.bodegadk.match.MatchParticipant;
import dk.bodegadk.match.MatchStatus;
import dk.bodegadk.rating.RatingService;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class JdbcMatchHistoryStore implements MatchHistoryStore {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final DatabaseCacheService cacheService;
    private final RatingService ratingService;

    public JdbcMatchHistoryStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
                                 DatabaseCacheService cacheService) {
        this(jdbcTemplate, objectMapper, cacheService, null);
    }

    public JdbcMatchHistoryStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
                                 DatabaseCacheService cacheService, RatingService ratingService) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.cacheService = cacheService;
        this.ratingService = ratingService;
    }

    @Override
    @Transactional
    public void recordCompletedMatch(String roomCode, String winnerUserId, JsonNode finalState) {
        recordCompletedMatch(roomCode, winnerUserId, List.of(), finalState);
    }

    @Override
    @Transactional
    public void recordCompletedMatch(
            String roomCode,
            String winnerUserId,
            List<CompletedParticipant> completedParticipants,
            JsonNode finalState
    ) {
        RoomContext room = roomContext(roomCode);
        if (room == null || completedMatchExists(room.roomId())) {
            return;
        }

        String finalStateJson = toJson(finalState);
        UUID matchId = UUID.randomUUID();
        Instant completedAt = Instant.now();
        jdbcTemplate.update(
                """
                update public.rooms
                set status = 'FINISHED'
                where id = ?::uuid
                """,
                room.roomId()
        );

        jdbcTemplate.update(
                """
                insert into public.matches (id, game_id, room_id, status, \"mode\", ended_at, winner_user_id, result_type, final_state)
                values (?, ?::uuid, ?::uuid, 'COMPLETED', ?, ?, ?::uuid,
                        case when ?::text is null then 'DRAW' else 'WIN' end,
                        cast(? as jsonb))
                """,
                matchId,
                room.gameId(),
                room.roomId(),
                room.mode(),
                Timestamp.from(completedAt),
                winnerUserId,
                winnerUserId,
                finalStateJson
        );

        List<ParticipantSnapshot> participants = jdbcTemplate.query(
                """
                select user_id::text, status
                from public.room_players
                where room_id = ?::uuid
                  and status in ('JOINED', 'READY', 'DISCONNECTED')
                order by joined_at asc
                """,
                (rs, rowNum) -> new ParticipantSnapshot(
                        rs.getString("user_id"),
                        "DISCONNECTED".equals(rs.getString("status"))
                ),
                room.roomId()
        );

        // Batch insert match_players
        String matchPlayersSql = """
                insert into public.match_players (match_id, user_id, seat_index, result, placement, abandoned)
                values (?, ?::uuid, ?, ?, ?, ?)
                on conflict (match_id, user_id) do nothing
                """;

        List<Object[]> matchPlayerArgs = new ArrayList<>();
        int seatIndex = 0;
        for (ParticipantSnapshot participant : participants) {
            CompletedParticipant completion = completedParticipants.stream()
                    .filter(value -> value.playerId().equals(participant.playerId()))
                    .findFirst()
                    .orElse(null);
            String result = completion != null && completion.abandoned()
                    ? "ABANDONED"
                    : winnerUserId == null ? "DRAW"
                    : (winnerUserId.equals(participant.playerId()) ? "WIN" : "LOSS");
            int placement = completion != null ? completion.placement() : winnerUserId == null ? 1
                    : (winnerUserId.equals(participant.playerId()) ? 1 : 2);
            boolean abandoned = completion != null ? completion.abandoned() : participant.abandoned();
            matchPlayerArgs.add(new Object[]{
                    matchId, participant.playerId(), seatIndex, result, placement, abandoned
            });
            seatIndex++;
        }
        jdbcTemplate.batchUpdate(matchPlayersSql, matchPlayerArgs);

        // Enqueue deferred writes
        if (cacheService != null) {
            seatIndex = 0;
            for (ParticipantSnapshot participant : participants) {
                String result = winnerUserId == null ? "DRAW"
                        : (winnerUserId.equals(participant.playerId()) ? "WIN" : "LOSS");
                cacheService.enqueueStats(participant.playerId(), room.gameId(), result, null, completedAt);
                cacheService.enqueueLeaderboard(participant.playerId(), room.gameId(), matchId, result);
                seatIndex++;
            }
        }
        applyRating(matchId, room, participants, completedParticipants, winnerUserId, completedAt);
    }

    private RoomContext roomContext(String roomCode) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    select rooms.id::text as room_id, rooms.game_id::text as game_id,
                           games.slug as game_type, rooms.\"mode\"
                    from public.rooms
                    join public.games on games.id = rooms.game_id
                    where room_code = ?
                    """,
                    (rs, rowNum) -> new RoomContext(
                            rs.getString("room_id"),
                            rs.getString("game_id"),
                            rs.getString("game_type"),
                            readMode(rs.getString("mode"))
                    ),
                    roomCode
            );
        } catch (EmptyResultDataAccessException exception) {
            return null;
        }
    }

    private boolean completedMatchExists(String roomId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                select count(*)
                from public.matches
                where room_id = ?::uuid
                  and status = 'COMPLETED'
                """,
                Integer.class,
                roomId
        );
        return count != null && count > 0;
    }

    private String toJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node == null ? objectMapper.createObjectNode() : node);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }

    private void applyRating(UUID matchId, RoomContext room, List<ParticipantSnapshot> snapshots,
                             List<CompletedParticipant> completedParticipants,
                             String winnerUserId, Instant completedAt) {
        if (ratingService == null || !"RANKED".equals(room.mode()) || snapshots.size() < 2) {
            return;
        }
        List<MatchParticipant> ratingParticipants = new ArrayList<>();
        for (ParticipantSnapshot participant : snapshots) {
            CompletedParticipant completion = completedParticipants.stream()
                    .filter(value -> value.playerId().equals(participant.playerId()))
                    .findFirst()
                    .orElse(null);
            int placement = completion != null ? completion.placement() : winnerUserId == null ? 1
                    : (winnerUserId.equals(participant.playerId()) ? 1 : 2);
            ratingParticipants.add(new MatchParticipant(
                    participant.playerId(), placement,
                    completion != null ? completion.abandoned() : participant.abandoned()
            ));
        }
        ratingService.applyResult(new Match(
                matchId, room.gameType(), MatchMode.RANKED, MatchStatus.COMPLETED,
                completedAt, completedAt, ratingParticipants
        ));
    }

    record ParticipantSnapshot(String playerId, boolean abandoned) {
    }

    private record RoomContext(String roomId, String gameId, String gameType, String mode) {
    }

    private String readMode(String mode) {
        return mode == null || mode.isBlank() ? "UNRANKED" : mode;
    }
}
