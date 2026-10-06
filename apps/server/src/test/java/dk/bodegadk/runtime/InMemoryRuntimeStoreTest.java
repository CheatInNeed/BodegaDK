package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(OutputCaptureExtension.class)
class InMemoryRuntimeStoreTest {

    @Test
    void roomTaskFailureIsLoggedAndRoomKeepsWorking(CapturedOutput output) throws Exception {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        CountDownLatch nextTaskRan = new CountDownLatch(1);
        try {
            store.submit("ROOM1", () -> {
                throw new IllegalStateException("boom");
            });
            store.submit("ROOM1", nextTaskRan::countDown);

            // Tasks in a room run one at a time, so once the second has run the first has been logged.
            assertTrue(nextTaskRan.await(2, TimeUnit.SECONDS));
            assertTrue(output.getAll().contains("Room task failed in room ROOM1"));
            assertTrue(output.getAll().contains("boom"));
        } finally {
            store.shutdownExecutors();
        }
    }

    @Test
    void migratesHostWhenCurrentHostLeaves() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", "alice", "token-p1");
        store.joinRoom(roomCode, "p2", "bob", "token-p2");
        store.joinRoom(roomCode, "p3", "charlie", "token-p3");

        store.leaveRoom(roomCode, "token-p1");

        InMemoryRuntimeStore.RoomSnapshot room = store.roomSnapshot(roomCode).orElseThrow();
        assertEquals("p2", room.hostPlayerId());
        assertEquals(2, room.participants().size());
        assertEquals("p2", room.participants().getFirst().playerId());
        assertEquals("bob", room.participants().getFirst().username());
    }

    @Test
    void deletesRoomWhenLastPlayerLeaves() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", "alice", "token-p1");

        store.leaveRoom(roomCode, "token-p1");

        assertFalse(store.roomExists(roomCode));
        assertTrue(store.roomSnapshot(roomCode).isEmpty());
    }

    @Test
    void expiresConnectedSessionsWithoutHeartbeat() throws InterruptedException {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", "alice", "token-p1");
        store.resolveConnect(roomCode, "token-p1");

        Thread.sleep(15);

        var expired = store.sweepExpiredSessions(Duration.ofMillis(5));

        assertEquals(1, expired.size());
        assertFalse(store.roomExists(roomCode));
    }

    @Test
    void disconnectKeepsPlayerInRoomUntilHeartbeatTimeout() throws InterruptedException {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", "alice", "token-p1");
        store.resolveConnect(roomCode, "token-p1");

        store.disconnect("token-p1");

        assertTrue(store.roomExists(roomCode));
        assertEquals(1, store.roomSnapshot(roomCode).orElseThrow().participants().size());

        Thread.sleep(15);

        var expired = store.sweepExpiredSessions(Duration.ofMillis(5));

        assertEquals(1, expired.size());
        assertFalse(store.roomExists(roomCode));
    }

    @Test
    void krigRoomReturnsToLobbyWhenOpponentLeavesMidMatch() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("krig", false, "p1");
        store.joinRoom(roomCode, "p1", "alice", "token-p1");
        store.joinRoom(roomCode, "p2", "bob", "token-p2");
        store.markRoomInGame(roomCode, "p1");

        store.leaveRoom(roomCode, "token-p2");

        InMemoryRuntimeStore.RoomSnapshot room = store.roomSnapshot(roomCode).orElseThrow();
        assertEquals("LOBBY", room.status().name());
        assertEquals(1, room.participants().size());
    }

    @Test
    void hostCanToggleLobbyVisibility() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", "alice", "token-p1");

        store.updateVisibility(roomCode, "token-p1", true);

        InMemoryRuntimeStore.RoomSnapshot room = store.roomSnapshot(roomCode).orElseThrow();
        assertTrue(room.isPrivate());
    }

    @Test
    void nonHostCannotToggleLobbyVisibility() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", "alice", "token-p1");
        store.joinRoom(roomCode, "p2", "bob", "token-p2");

        assertThrows(IllegalStateException.class, () -> store.updateVisibility(roomCode, "token-p2", true));
    }

    @Test
    void claimSessionIdentityMigratesHostSeat() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("snyd", false, "guest-1");
        store.joinRoom(roomCode, "guest-1", null, "token-p1");

        store.claimSessionIdentity(roomCode, "token-p1", "user-123", "alice");

        InMemoryRuntimeStore.RoomSnapshot room = store.roomSnapshot(roomCode).orElseThrow();
        assertEquals("user-123", room.hostPlayerId());
        assertEquals("user-123", room.participants().getFirst().playerId());
        assertEquals("alice", room.participants().getFirst().username());
    }

    @Test
    void claimSessionIdentityRejectsDuplicateTargetIdentity() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        String roomCode = store.createRoom("snyd", false, "guest-1");
        store.joinRoom(roomCode, "guest-1", null, "token-p1");
        store.joinRoom(roomCode, "user-123", "alice", "token-p2");

        assertThrows(IllegalStateException.class, () -> store.claimSessionIdentity(roomCode, "token-p1", "user-123", "alice"));
    }
}
