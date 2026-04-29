package dk.bodegadk.runtime;

import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class JdbcMatchHistoryQueryStore implements MatchHistoryQueryStore {
    private final JdbcTemplate jdbcTemplate;

    public JdbcMatchHistoryQueryStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public MatchHistoryPage recentMatchesForUser(String userId, int limit, Instant before) {
        int boundedLimit = Math.max(1, Math.min(limit, 50));
        Timestamp beforeTimestamp = before == null ? null : Timestamp.from(before);

        List<MatchRow> rows = jdbcTemplate.query(
                """
                select
                  matches.id::text as match_id,
                  games.id::text as game_id,
                  games.slug as game_slug,
                  games.title as game_title,
                  rooms.room_code,
                  matches.status,
                  matches.started_at,
                  matches.ended_at,
                  matches.result_type,
                  matches.winner_user_id::text as winner_user_id,
                  current_player.user_id::text as current_user_id,
                  coalesce(current_profile.username, current_player.user_id::text) as current_username,
                  current_player.result as current_result,
                  current_player.score as current_score,
                  current_player.seat_index as current_seat_index,
                  coalesce(matches.ended_at, matches.started_at) as sort_at
                from public.match_players current_player
                join public.matches matches on matches.id = current_player.match_id
                join public.games games on games.id = matches.game_id
                left join public.rooms rooms on rooms.id = matches.room_id
                left join public.profiles current_profile on current_profile.user_id = current_player.user_id
                where current_player.user_id = ?::uuid
                  and matches.status = 'COMPLETED'
                  and (?::timestamptz is null or coalesce(matches.ended_at, matches.started_at) < ?::timestamptz)
                order by coalesce(matches.ended_at, matches.started_at) desc
                limit ?
                """,
                (rs, rowNum) -> new MatchRow(
                        rs.getString("match_id"),
                        new GameSummary(
                                rs.getString("game_id"),
                                rs.getString("game_slug"),
                                rs.getString("game_title")
                        ),
                        rs.getString("room_code"),
                        rs.getString("status"),
                        toInstant(rs.getTimestamp("started_at")),
                        toInstant(rs.getTimestamp("ended_at")),
                        rs.getString("result_type"),
                        rs.getString("winner_user_id"),
                        new PlayerSummary(
                                rs.getString("current_user_id"),
                                rs.getString("current_username"),
                                rs.getString("current_result"),
                                (Integer) rs.getObject("current_score"),
                                (Integer) rs.getObject("current_seat_index")
                        ),
                        toInstant(rs.getTimestamp("sort_at"))
                ),
                userId,
                beforeTimestamp,
                beforeTimestamp,
                boundedLimit
        );

        Map<String, List<PlayerSummary>> playersByMatchId = playersByMatchId(rows);
        List<MatchSummary> items = rows.stream()
                .map(row -> new MatchSummary(
                        row.matchId(),
                        row.game(),
                        row.roomCode(),
                        row.status(),
                        row.startedAt(),
                        row.endedAt(),
                        row.resultType(),
                        row.winnerUserId(),
                        row.currentUser(),
                        playersByMatchId.getOrDefault(row.matchId(), List.of())
                ))
                .toList();

        Instant nextCursor = items.size() == boundedLimit && !rows.isEmpty()
                ? rows.getLast().sortAt()
                : null;
        return new MatchHistoryPage(items, boundedLimit, nextCursor);
    }

    private Map<String, List<PlayerSummary>> playersByMatchId(List<MatchRow> rows) {
        if (rows.isEmpty()) {
            return Map.of();
        }

        List<String> placeholders = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (MatchRow row : rows) {
            placeholders.add("?::uuid");
            args.add(row.matchId());
        }

        String sql = """
                select
                  match_players.match_id::text as match_id,
                  match_players.user_id::text as user_id,
                  coalesce(profiles.username, match_players.user_id::text) as username,
                  match_players.result,
                  match_players.score,
                  match_players.seat_index
                from public.match_players
                left join public.profiles on profiles.user_id = match_players.user_id
                where match_players.match_id in (%s)
                order by match_players.match_id, match_players.seat_index asc nulls last, match_players.created_at asc
                """.formatted(String.join(", ", placeholders));

        Map<String, List<PlayerSummary>> playersByMatchId = new LinkedHashMap<>();
        jdbcTemplate.query(sql, rs -> {
            String matchId = rs.getString("match_id");
            playersByMatchId.computeIfAbsent(matchId, key -> new ArrayList<>())
                    .add(new PlayerSummary(
                            rs.getString("user_id"),
                            rs.getString("username"),
                            rs.getString("result"),
                            (Integer) rs.getObject("score"),
                            (Integer) rs.getObject("seat_index")
                    ));
        }, args.toArray());

        return playersByMatchId;
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record MatchRow(
            String matchId,
            GameSummary game,
            String roomCode,
            String status,
            Instant startedAt,
            Instant endedAt,
            String resultType,
            String winnerUserId,
            PlayerSummary currentUser,
            Instant sortAt
    ) {
    }
}
