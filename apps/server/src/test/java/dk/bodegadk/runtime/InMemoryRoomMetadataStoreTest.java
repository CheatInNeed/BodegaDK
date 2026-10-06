package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InMemoryRoomMetadataStoreTest {

    @Test
    void enqueueTicketReturnsExistingWaitingTicketForSamePlayerAndGame() {
        InMemoryRoomMetadataStore store = new InMemoryRoomMetadataStore();

        UUID firstTicket = store.enqueueTicket("casino", "p1", "alice", "token-a", 2, 2, true);
        UUID secondTicket = store.enqueueTicket("casino", "p1", "alice", "token-a", 2, 2, true);

        assertEquals(firstTicket, secondTicket);
        assertEquals(1, store.waitingTickets("casino").size());
    }

    @Test
    void enqueueTicketReturnsExistingWaitingTicketForSamePlayerAcrossGames() {
        InMemoryRoomMetadataStore store = new InMemoryRoomMetadataStore();

        UUID firstTicket = store.enqueueTicket("casino", "p1", "alice", "token-a", 2, 2, true);
        UUID secondTicket = store.enqueueTicket("krig", "p1", "alice", "token-a", 2, 2, true);

        assertEquals(firstTicket, secondTicket);
        assertEquals(1, store.waitingTickets("casino").size());
        assertEquals(0, store.waitingTickets("krig").size());
    }

    @Test
    void enqueueTicketCreatesNewTicketAfterExistingTicketIsCancelled() {
        InMemoryRoomMetadataStore store = new InMemoryRoomMetadataStore();

        UUID firstTicket = store.enqueueTicket("casino", "p1", "alice", "token-a", 2, 2, true);
        store.cancelTicket(firstTicket);
        UUID secondTicket = store.enqueueTicket("krig", "p1", "alice", "token-a", 2, 2, true);

        assertEquals(0, store.waitingTickets("casino").size());
        assertEquals(1, store.waitingTickets("krig").size());
        assertNotEquals(firstTicket, secondTicket);
    }

    @Test
    void createRoomAndJoinHostCreatesRoomWithParticipant() {
        InMemoryRoomMetadataStore store = new InMemoryRoomMetadataStore();

        boolean created = store.createRoomAndJoinHost(
                "ABCD", "p1", RoomMetadataStore.RoomVisibility.PUBLIC,
                "casino", InMemoryRuntimeStore.RoomStatus.LOBBY, "alice");

        assertTrue(created);
        assertTrue(store.roomExists("ABCD"));
        RoomMetadataStore.StoredRoom room = store.room("ABCD").orElseThrow();
        assertEquals("p1", room.hostUserId());
        assertEquals("casino", room.selectedGame());
        assertEquals(1, room.participants().size());
        assertEquals("p1", room.participants().getFirst().playerId());
        assertEquals("alice", room.participants().getFirst().username());
    }
}
