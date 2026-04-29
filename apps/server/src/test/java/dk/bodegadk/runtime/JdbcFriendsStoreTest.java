package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcFriendsStoreTest {
    private static final String ALICE_ID = "11111111-1111-1111-1111-111111111111";
    private static final String BOB_ID = "22222222-2222-2222-2222-222222222222";
    private static final String FRIENDSHIP_ID = "33333333-3333-3333-3333-333333333333";

    @Test
    void sendRequestRejectsSelfFriendship() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.queryForObject(contains("from public.profiles"), eq(String.class), eq("Alice")))
                .thenReturn(ALICE_ID);

        assertThrows(FriendsStore.SelfFriendshipException.class, () -> store.sendRequest(ALICE_ID, "Alice"));
    }

    @Test
    void sendRequestRejectsDuplicateOrInverseFriendship() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.queryForObject(contains("from public.profiles"), eq(String.class), eq("Bob")))
                .thenReturn(BOB_ID);
        when(jdbcTemplate.queryForObject(contains("least(friendships.requester_user_id"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(summary("PENDING"));

        assertThrows(FriendsStore.DuplicateFriendshipException.class, () -> store.sendRequest(ALICE_ID, "Bob"));
    }

    @Test
    void declinedRequestCanBeReRequested() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.queryForObject(contains("from public.profiles"), eq(String.class), eq("Bob")))
                .thenReturn(BOB_ID);
        when(jdbcTemplate.queryForObject(contains("least(friendships.requester_user_id"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(summary("DECLINED"));
        when(jdbcTemplate.queryForObject(contains("insert into public.friendships"), eq(String.class), eq(ALICE_ID), eq(BOB_ID)))
                .thenReturn(FRIENDSHIP_ID);
        when(jdbcTemplate.queryForObject(contains("where friendships.id"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(summary("PENDING"));

        FriendsStore.FriendshipSummary result = store.sendRequest(ALICE_ID, "Bob");

        verify(jdbcTemplate).update("delete from public.friendships where id = ?::uuid", FRIENDSHIP_ID);
        assertEquals("PENDING", result.status());
    }

    @Test
    void acceptOnlyUpdatesPendingRequestForAddressee() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.update(contains("set status = 'ACCEPTED'"), eq(FRIENDSHIP_ID), eq(BOB_ID))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("where friendships.id"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(summary("ACCEPTED"));

        FriendsStore.FriendshipSummary result = store.acceptRequest(BOB_ID, FRIENDSHIP_ID);

        assertEquals("ACCEPTED", result.status());
    }

    @Test
    void acceptThrowsNotFoundWhenUserIsNotAddressee() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.update(contains("set status = 'ACCEPTED'"), eq(FRIENDSHIP_ID), eq(ALICE_ID))).thenReturn(0);

        assertThrows(FriendsStore.FriendNotFoundException.class, () -> store.acceptRequest(ALICE_ID, FRIENDSHIP_ID));
    }

    @Test
    void removeOnlyDeletesParticipantFriendship() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.update(contains("delete from public.friendships"), eq(FRIENDSHIP_ID), eq(ALICE_ID), eq(ALICE_ID))).thenReturn(1);

        store.remove(ALICE_ID, FRIENDSHIP_ID);

        verify(jdbcTemplate).update(contains("delete from public.friendships"), eq(FRIENDSHIP_ID), eq(ALICE_ID), eq(ALICE_ID));
    }

    @Test
    void acceptedFriendsReturnsRowsForEitherParticipant() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.query(contains("friendships.status = 'ACCEPTED'"), any(RowMapper.class), eq(ALICE_ID), eq(ALICE_ID), eq(ALICE_ID)))
                .thenReturn(List.of(summary("ACCEPTED")));

        List<FriendsStore.FriendshipSummary> result = store.acceptedFriends(ALICE_ID);

        assertEquals(1, result.size());
        assertEquals("ACCEPTED", result.getFirst().status());
    }

    @Test
    void missingUsernameThrowsNotFound() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcFriendsStore store = new JdbcFriendsStore(jdbcTemplate);
        when(jdbcTemplate.queryForObject(contains("from public.profiles"), eq(String.class), eq("Missing")))
                .thenThrow(new EmptyResultDataAccessException(1));

        assertThrows(FriendsStore.FriendNotFoundException.class, () -> store.sendRequest(ALICE_ID, "Missing"));
    }

    private FriendsStore.FriendshipSummary summary(String status) {
        FriendsStore.FriendUser requester = new FriendsStore.FriendUser(ALICE_ID, "Alice", null);
        FriendsStore.FriendUser addressee = new FriendsStore.FriendUser(BOB_ID, "Bob", null);
        return new FriendsStore.FriendshipSummary(FRIENDSHIP_ID, status, requester, addressee, Instant.now(), Instant.now());
    }
}
