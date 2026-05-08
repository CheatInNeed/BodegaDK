package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcUserGameStatsQueryStoreTest {
    private static final String USER_ID = "11111111-1111-1111-1111-111111111111";

    @Test
    void statsForUserWithoutGameFilterUsesSingleTypedUserArgument() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcUserGameStatsQueryStore store = new JdbcUserGameStatsQueryStore(jdbcTemplate);
        when(jdbcTemplate.query(contains("where games.is_active = true"), any(RowMapper.class), eq(USER_ID)))
                .thenReturn(List.of());

        UserGameStatsQueryStore.UserGameStatsPage page = store.statsForUser(USER_ID, null);

        assertEquals(0, page.items().size());
        verify(jdbcTemplate).query(contains("where games.is_active = true"), any(RowMapper.class), eq(USER_ID));
    }

    @Test
    void statsForUserWithGameFilterAddsSlugPredicateAndArgument() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcUserGameStatsQueryStore store = new JdbcUserGameStatsQueryStore(jdbcTemplate);
        when(jdbcTemplate.query(contains("and games.slug = ?"), any(RowMapper.class), eq(USER_ID), eq("snyd")))
                .thenReturn(List.of());

        UserGameStatsQueryStore.UserGameStatsPage page = store.statsForUser(USER_ID, "snyd");

        assertEquals(0, page.items().size());
        verify(jdbcTemplate).query(contains("and games.slug = ?"), any(RowMapper.class), eq(USER_ID), eq("snyd"));
    }
}
