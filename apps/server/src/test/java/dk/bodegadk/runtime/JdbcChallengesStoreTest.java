package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcChallengesStoreTest {
    private static final String ALICE_ID = "11111111-1111-1111-1111-111111111111";
    private static final String BOB_ID = "22222222-2222-2222-2222-222222222222";
    private static final String CHALLENGE_ID = "33333333-3333-3333-3333-333333333333";

    @Test
    void createRequiresAcceptedFriendship() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcChallengesStore store = store(jdbcTemplate, new FakeRooms(), new InMemoryRuntimeStore());
        when(jdbcTemplate.queryForObject(contains("from public.profiles"), eq(String.class), eq("Bob"))).thenReturn(BOB_ID);
        when(jdbcTemplate.queryForObject(contains("from public.friendships"), eq(Integer.class), eq(ALICE_ID), eq(BOB_ID), eq(ALICE_ID), eq(BOB_ID))).thenReturn(0);

        assertThrows(ChallengesStore.ChallengeValidationException.class, () -> store.createChallenge(ALICE_ID, "Bob", "snyd"));
    }

    @Test
    void createRejectsSelfChallenge() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcChallengesStore store = store(jdbcTemplate, new FakeRooms(), new InMemoryRuntimeStore());
        when(jdbcTemplate.queryForObject(contains("from public.profiles"), eq(String.class), eq("Alice"))).thenReturn(ALICE_ID);

        assertThrows(ChallengesStore.ChallengeValidationException.class, () -> store.createChallenge(ALICE_ID, "Alice", "snyd"));
    }

    @Test
    void createRejectsInactiveGame() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcChallengesStore store = store(jdbcTemplate, new FakeRooms(), new InMemoryRuntimeStore());
        when(jdbcTemplate.queryForObject(contains("from public.profiles"), eq(String.class), eq("Bob"))).thenReturn(BOB_ID);
        when(jdbcTemplate.queryForObject(contains("from public.friendships"), eq(Integer.class), eq(ALICE_ID), eq(BOB_ID), eq(ALICE_ID), eq(BOB_ID))).thenReturn(1);

        assertThrows(ChallengesStore.ChallengeValidationException.class, () -> store.createChallenge(ALICE_ID, "Bob", "poker"));
    }

    @Test
    void acceptCreatesPrivateLobbyWithBothParticipants() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        FakeRooms rooms = new FakeRooms();
        InMemoryRuntimeStore runtimeStore = new InMemoryRuntimeStore();
        JdbcChallengesStore store = store(jdbcTemplate, rooms, runtimeStore);
        when(jdbcTemplate.queryForObject(contains("and (challenges.challenger_user_id"), any(RowMapper.class), eq(CHALLENGE_ID), eq(BOB_ID), eq(BOB_ID)))
                .thenReturn(summary("PENDING", null, Instant.now().plusSeconds(3600)));
        when(jdbcTemplate.update(contains("set status = 'ACCEPTED'"), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForObject(contains("where challenges.id = ?::uuid"), any(RowMapper.class), eq(CHALLENGE_ID)))
                .thenReturn(summary("ACCEPTED", "ABC123", Instant.now().plusSeconds(3600)));

        ChallengesStore.ChallengeAcceptResult result = store.acceptChallenge(BOB_ID, CHALLENGE_ID);

        assertEquals("snyd", result.room().selectedGame());
        assertEquals(true, result.room().isPrivate());
        assertEquals(2, rooms.participants.size());
        verify(jdbcTemplate).update(contains("set status = 'ACCEPTED'"), any(Object[].class));
    }

    @Test
    void acceptRejectsNonPendingChallenge() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        JdbcChallengesStore store = store(jdbcTemplate, new FakeRooms(), new InMemoryRuntimeStore());
        when(jdbcTemplate.queryForObject(contains("and (challenges.challenger_user_id"), any(RowMapper.class), eq(CHALLENGE_ID), eq(BOB_ID), eq(BOB_ID)))
                .thenReturn(summary("CANCELLED", null, Instant.now().plusSeconds(3600)));

        assertThrows(ChallengesStore.ChallengeConflictException.class, () -> store.acceptChallenge(BOB_ID, CHALLENGE_ID));
    }

    private JdbcChallengesStore store(JdbcTemplate jdbcTemplate, RoomMetadataStore rooms, InMemoryRuntimeStore runtimeStore) {
        return new JdbcChallengesStore(jdbcTemplate, new GameCatalogService(), rooms, runtimeStore, new CapturingNotifications());
    }

    private ChallengesStore.ChallengeSummary summary(String status, String roomCode, Instant expiresAt) {
        FriendsStore.FriendUser alice = new FriendsStore.FriendUser(ALICE_ID, "Alice", null);
        FriendsStore.FriendUser bob = new FriendsStore.FriendUser(BOB_ID, "Bob", null);
        return new ChallengesStore.ChallengeSummary(
                CHALLENGE_ID,
                status,
                alice,
                bob,
                new ChallengesStore.GameSummary("44444444-4444-4444-4444-444444444444", "snyd", "Snyd"),
                roomCode,
                Instant.now(),
                expiresAt,
                null
        );
    }

    private static class CapturingNotifications implements NotificationsStore {
        @Override
        public NotificationPage notifications(String currentUserId, int limit) {
            return new NotificationPage(List.of(), 0, limit);
        }

        @Override
        public NotificationSummary markRead(String currentUserId, String notificationId) {
            return null;
        }

        @Override
        public void markAllRead(String currentUserId) {
        }

        @Override
        public void createIfUnreadMissing(String userId, String actorUserId, String type, Map<String, Object> payload) {
        }
    }

    private static class FakeRooms implements RoomMetadataStore {
        private final List<String> participants = new ArrayList<>();

        @Override
        public boolean roomExists(String roomCode) {
            return false;
        }

        @Override
        public void createRoom(String roomCode, String hostUserId, RoomVisibility visibility, String gameType, InMemoryRuntimeStore.RoomStatus status) {
        }

        @Override
        public Optional<StoredRoom> room(String roomCode) {
            return Optional.empty();
        }

        @Override
        public List<StoredRoom> publicRooms() {
            return List.of();
        }

        @Override
        public void upsertParticipant(String roomCode, String userId, String username) {
            participants.add(userId);
        }

        @Override
        public void removeParticipant(String roomCode, String userId) {
        }

        @Override
        public void updateRoomHost(String roomCode, String hostUserId) {
        }

        @Override
        public void updateRoomGameType(String roomCode, String gameType) {
        }

        @Override
        public void updateRoomVisibility(String roomCode, RoomVisibility visibility) {
        }

        @Override
        public void updateRoomStatus(String roomCode, InMemoryRuntimeStore.RoomStatus status) {
        }

        @Override
        public void deleteRoom(String roomCode) {
        }

        @Override
        public UUID enqueueTicket(String gameType, String userId, String username, String clientSessionId, int minPlayers, int maxPlayers, boolean strictCount) {
            return UUID.randomUUID();
        }

        @Override
        public Optional<MatchmakingTicket> ticket(UUID ticketId) {
            return Optional.empty();
        }

        @Override
        public List<MatchmakingTicket> waitingTickets(String gameType) {
            return List.of();
        }

        @Override
        public void markTicketMatched(UUID ticketId, String roomCode) {
        }

        @Override
        public void cancelTicket(UUID ticketId) {
        }

        @Override
        public void markRoomAbandoned(String roomCode) {
        }
    }
}
