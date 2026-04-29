package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcMatchHistoryStoreTest {

    @Test
    void completedMatchCreatesParticipantsAndStatsRows() throws Exception {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcMatchHistoryStore store = new JdbcMatchHistoryStore(jdbcTemplate, new ObjectMapper());
        String roomId = "11111111-1111-1111-1111-111111111111";
        String gameId = "22222222-2222-2222-2222-222222222222";
        String winnerId = "33333333-3333-3333-3333-333333333333";
        String loserId = "44444444-4444-4444-4444-444444444444";

        mockRoomContext(jdbcTemplate, roomId, gameId);
        when(jdbcTemplate.queryForObject(contains("select count(*)"), eq(Integer.class), eq(roomId))).thenReturn(0);
        when(jdbcTemplate.query(contains("select user_id::text"), any(RowMapper.class), eq(roomId)))
                .thenReturn(List.of(winnerId, loserId));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        store.recordCompletedMatch("ROOM1", winnerId, new ObjectMapper().createObjectNode());

        verify(jdbcTemplate).update(contains("update public.rooms"), eq(roomId));
        verify(jdbcTemplate).update(contains("insert into public.matches"), any(Object[].class));
        verify(jdbcTemplate, times(2)).update(contains("insert into public.match_players"), any(Object[].class));
        verify(jdbcTemplate, times(2)).update(contains("insert into public.user_game_stats"), any(Object[].class));
        verify(jdbcTemplate, times(2)).update(contains("insert into public.leaderboard_scores"), any(Object[].class));
    }

    @Test
    void duplicateCompletedMatchDoesNotDoubleCountStats() throws Exception {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcMatchHistoryStore store = new JdbcMatchHistoryStore(jdbcTemplate, new ObjectMapper());
        String roomId = "11111111-1111-1111-1111-111111111111";
        String gameId = "22222222-2222-2222-2222-222222222222";

        mockRoomContext(jdbcTemplate, roomId, gameId);
        when(jdbcTemplate.queryForObject(contains("select count(*)"), eq(Integer.class), eq(roomId))).thenReturn(1);

        store.recordCompletedMatch("ROOM1", "33333333-3333-3333-3333-333333333333", new ObjectMapper().createObjectNode());

        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    private void mockRoomContext(JdbcTemplate jdbcTemplate, String roomId, String gameId) {
        when(jdbcTemplate.queryForObject(contains("select id::text"), any(RowMapper.class), eq("ROOM1")))
                .thenAnswer(invocation -> {
                    RowMapper<?> mapper = invocation.getArgument(1);
                    ResultSet resultSet = mock(ResultSet.class);
                    when(resultSet.getString("room_id")).thenReturn(roomId);
                    when(resultSet.getString("game_id")).thenReturn(gameId);
                    return mapper.mapRow(resultSet, 0);
                });
    }
}
