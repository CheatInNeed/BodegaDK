package dk.bodegadk.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    public JdbcMatchHistoryStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper,
                                 DatabaseCacheService cacheService) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.cacheService = cacheService;
    }

    @Override
    @Transactional
    public void recordCompletedMatch(String roomCode, String winnerUserId, JsonNode finalState) {
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
                insert into public.matches (id, game_id, room_id, status, ended_at, winner_user_id, result_type, final_state)
                values (?, ?::uuid, ?::uuid, 'COMPLETED', ?, ?::uuid,
                        case when ?::text is null then 'DRAW' else 'WIN' end,
                        cast(? as jsonb))
                """,
                matchId,
                room.gameId(),
                room.roomId(),
                Timestamp.from(completedAt),
                winnerUserId,
                winnerUserId,
                finalStateJson
        );

        List<String> participantIds = jdbcTemplate.query(
                """
                select user_id::text
                from public.room_players
                where room_id = ?::uuid
                  and status in ('JOINED', 'READY', 'DISCONNECTED')
                order by joined_at asc
                """,
                (rs, rowNum) -> rs.getString(1),
                room.roomId()
        );

        // Batch insert match_players
        String matchPlayersSql = """
                insert into public.match_players (match_id, user_id, seat_index, result)
                values (?, ?::uuid, ?, ?)
                on conflict (match_id, user_id) do nothing
                """;

        List<Object[]> matchPlayerArgs = new ArrayList<>();
        int seatIndex = 0;
        for (String participantId : participantIds) {
            String result = winnerUserId == null ? "DRAW" : (winnerUserId.equals(participantId) ? "WIN" : "LOSS");
            matchPlayerArgs.add(new Object[]{matchId, participantId, seatIndex, result});
            seatIndex++;
        }
        jdbcTemplate.batchUpdate(matchPlayersSql, matchPlayerArgs);

        // Enqueue deferred writes
        if (cacheService != null) {
            seatIndex = 0;
            for (String participantId : participantIds) {
                String result = winnerUserId == null ? "DRAW" : (winnerUserId.equals(participantId) ? "WIN" : "LOSS");
                cacheService.enqueueStats(participantId, room.gameId(), result, null, completedAt);
                cacheService.enqueueLeaderboard(participantId, room.gameId(), matchId, result);
                seatIndex++;
            }
        }
    }

    private RoomContext roomContext(String roomCode) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    select id::text as room_id, game_id::text as game_id
                    from public.rooms
                    where room_code = ?
                    """,
                    (rs, rowNum) -> new RoomContext(
                            rs.getString("room_id"),
                            rs.getString("game_id")
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

    private record RoomContext(String roomId, String gameId) {
    }
}
