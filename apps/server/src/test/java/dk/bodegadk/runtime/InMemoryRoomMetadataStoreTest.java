package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

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
}
