package dk.bodegadk.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
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
                        case when ? is null then 'DRAW' else 'WIN' end,
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
            upsertUserGameStats(participantId, room.gameId(), result, null, completedAt);
            upsertLeaderboardScore(participantId, room.gameId(), matchId, result);
            seatIndex += 1;
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

    private void upsertUserGameStats(String userId, String gameId, String result, Integer score, Instant completedAt) {
        int wins = "WIN".equals(result) ? 1 : 0;
        int losses = "LOSS".equals(result) ? 1 : 0;
        int draws = "DRAW".equals(result) ? 1 : 0;
        int streak = "WIN".equals(result) ? 1 : 0;
        long highScore = score == null ? 0 : score;

        jdbcTemplate.update(
                """
                insert into public.user_game_stats (
                  user_id,
                  game_id,
                  games_played,
                  wins,
                  losses,
                  draws,
                  high_score,
                  current_streak,
                  best_streak,
                  last_played_at
                )
                values (?::uuid, ?::uuid, 1, ?, ?, ?, ?, ?, ?, ?)
                on conflict (user_id, game_id) do update set
                  games_played = public.user_game_stats.games_played + 1,
                  wins = public.user_game_stats.wins + excluded.wins,
                  losses = public.user_game_stats.losses + excluded.losses,
                  draws = public.user_game_stats.draws + excluded.draws,
                  high_score = case
                    when ?::int is null then public.user_game_stats.high_score
                    else greatest(public.user_game_stats.high_score, excluded.high_score)
                  end,
                  current_streak = case
                    when ? = 'WIN' then public.user_game_stats.current_streak + 1
                    else 0
                  end,
                  best_streak = greatest(
                    public.user_game_stats.best_streak,
                    case
                      when ? = 'WIN' then public.user_game_stats.current_streak + 1
                      else 0
                    end
                  ),
                  last_played_at = greatest(
                    coalesce(public.user_game_stats.last_played_at, excluded.last_played_at),
                    excluded.last_played_at
                  )
                """,
                userId,
                gameId,
                wins,
                losses,
                draws,
                highScore,
                streak,
                streak,
                Timestamp.from(completedAt),
                score,
                result,
                result
        );
    }

    private void upsertLeaderboardScore(String userId, String gameId, UUID matchId, String result) {
        int score = currentWins(userId, gameId);
        if (!"WIN".equals(result)) {
            score = Math.max(score, 0);
        }

        jdbcTemplate.update(
                """
                insert into public.leaderboard_scores (
                  game_id,
                  user_id,
                  match_id,
                  score,
                  mode,
                  username_snapshot
                )
                values (
                  ?::uuid,
                  ?::uuid,
                  ?,
                  ?,
                  'standard',
                  coalesce((select username from public.profiles where user_id = ?::uuid), ?)
                )
                on conflict (game_id, user_id, mode) do update set
                  match_id = excluded.match_id,
                  score = greatest(public.leaderboard_scores.score, excluded.score),
                  username_snapshot = excluded.username_snapshot
                """,
                gameId,
                userId,
                matchId,
                score,
                userId,
                userId
        );
    }

    private int currentWins(String userId, String gameId) {
        Integer wins = jdbcTemplate.queryForObject(
                """
                select wins
                from public.user_game_stats
                where user_id = ?::uuid
                  and game_id = ?::uuid
                """,
                Integer.class,
                userId,
                gameId
        );
        return wins == null ? 0 : wins;
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
