package dk.bodegadk.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;

public class JdbcMatchHistoryStore implements MatchHistoryStore {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public JdbcMatchHistoryStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void recordCompletedMatch(String roomCode, String winnerUserId, JsonNode finalState) {
        String finalStateJson = toJson(finalState);
        UUID matchId = UUID.randomUUID();
        jdbcTemplate.update(
                """
                insert into public.matches (id, game_id, room_id, status, ended_at, winner_user_id, result_type, final_state)
                select ?, rooms.game_id, rooms.id, 'COMPLETED', now(), ?::uuid,
                       case when ? is null then 'DRAW' else 'WIN' end,
                       cast(? as jsonb)
                from public.rooms
                where rooms.room_code = ?
                """,
                matchId,
                winnerUserId,
                winnerUserId,
                finalStateJson,
                roomCode
        );

        List<String> participantIds = jdbcTemplate.query(
                """
                select user_id::text
                from public.room_players
                where room_id = (select id from public.rooms where room_code = ?)
                  and status in ('JOINED', 'READY', 'DISCONNECTED')
                order by joined_at asc
                """,
                (rs, rowNum) -> rs.getString(1),
                roomCode
        );

        int seatIndex = 0;
        for (String participantId : participantIds) {
            String result = winnerUserId == null ? "DRAW" : (winnerUserId.equals(participantId) ? "WIN" : "LOSS");
            jdbcTemplate.update(
                    """
                    insert into public.match_players (match_id, user_id, seat_index, result)
                    values (?, ?::uuid, ?, ?)
                    on conflict (match_id, user_id) do nothing
                    """,
                    matchId,
                    participantId,
                    seatIndex,
                    result
            );
            seatIndex += 1;
        }
    }

    private String toJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node == null ? objectMapper.createObjectNode() : node);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }
}
