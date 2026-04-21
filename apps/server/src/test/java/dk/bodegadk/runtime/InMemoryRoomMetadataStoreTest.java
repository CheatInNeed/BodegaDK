package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class InMemoryRoomMetadataStoreTest {

    @Test
    void enqueueTicketReturnsExistingWaitingTicketForSamePlayerAndGame() {
        InMemoryRoomMetadataStore store = new InMemoryRoomMetadataStore();

        UUID firstTicket = store.enqueueTicket("casino", "p1", "alice", "token-a", 2, 2, true);
        UUID secondTicket = store.enqueueTicket("casino", "p1", "alice", "token-a", 2, 2, true);

        assertEquals(firstTicket, secondTicket);
        assertEquals(1, store.waitingTickets("casino").size());
    }
}
