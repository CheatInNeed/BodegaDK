package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MatchmakingServiceTest {

    @Test
    void casinoQuickPlayMatchesTwoPlayersAndCreatesRoom() {
        RoomMetadataStore roomMetadataStore = new InMemoryRoomMetadataStore();
        GameCatalogService gameCatalogService = new GameCatalogService();
        InMemoryRuntimeStore runtimeStore = new InMemoryRuntimeStore();
        ObjectMapper objectMapper = new ObjectMapper();
        GameLoopService gameLoopService = new GameLoopService(
                runtimeStore,
                java.util.List.of(
                        new CasinoEnginePortAdapter(runtimeStore, objectMapper),
                        new HighCardEnginePortAdapter(runtimeStore, objectMapper)
                )
        );
        MatchmakingService matchmakingService = new MatchmakingService(
                roomMetadataStore,
                runtimeStore,
                gameLoopService,
                gameCatalogService,
                objectMapper
        );

        MatchmakingService.MatchmakingSnapshot first = matchmakingService.enqueue("casino", "p1", "Alice", "token-1");
        MatchmakingService.MatchmakingSnapshot second = matchmakingService.enqueue("casino", "p2", "Bob", "token-2");

        assertEquals(RoomMetadataStore.MatchmakingTicketStatus.WAITING, first.status());
        assertEquals(1, first.playersNeeded());
        assertEquals(RoomMetadataStore.MatchmakingTicketStatus.MATCHED, second.status());
        assertEquals(0, second.playersNeeded());

        MatchmakingService.MatchmakingSnapshot refreshedFirst = matchmakingService.ticketStatus(first.ticketId()).orElseThrow();
        assertEquals(RoomMetadataStore.MatchmakingTicketStatus.MATCHED, refreshedFirst.status());
        assertEquals(second.roomCode(), refreshedFirst.roomCode());

        InMemoryRuntimeStore.RoomSnapshot room = runtimeStore.roomSnapshot(second.roomCode()).orElseThrow();
        assertEquals(InMemoryRuntimeStore.RoomStatus.IN_GAME, room.status());
        assertEquals(2, room.participants().size());
        assertEquals("casino", room.selectedGame());

        RoomMetadataStore.StoredRoom storedRoom = roomMetadataStore.room(second.roomCode()).orElseThrow();
        assertEquals(InMemoryRuntimeStore.RoomStatus.IN_GAME, storedRoom.status());
        assertEquals(2, storedRoom.participants().size());
        assertEquals("casino", storedRoom.selectedGame());
    }

    @Test
    void femQuickPlayAcceptsFrontendAliasAndCreatesRoom() {
        RoomMetadataStore roomMetadataStore = new InMemoryRoomMetadataStore();
        GameCatalogService gameCatalogService = new GameCatalogService();
        InMemoryRuntimeStore runtimeStore = new InMemoryRuntimeStore();
        ObjectMapper objectMapper = new ObjectMapper();
        GameLoopService gameLoopService = new GameLoopService(
                runtimeStore,
                java.util.List.of(
                        new CasinoEnginePortAdapter(runtimeStore, objectMapper),
                        new HighCardEnginePortAdapter(runtimeStore, objectMapper),
                        new SnydEnginePortAdapter(runtimeStore, objectMapper),
                        new FemEnginePortAdapter(runtimeStore, objectMapper)
                )
        );
        MatchmakingService matchmakingService = new MatchmakingService(
                roomMetadataStore,
                runtimeStore,
                gameLoopService,
                gameCatalogService,
                objectMapper
        );

        MatchmakingService.MatchmakingSnapshot first = matchmakingService.enqueue("game.500", "p1", "Alice", "token-1");
        MatchmakingService.MatchmakingSnapshot second = matchmakingService.enqueue("fem", "p2", "Bob", "token-2");

        assertEquals("fem", first.gameType());
        assertEquals(RoomMetadataStore.MatchmakingTicketStatus.MATCHED, second.status());

        InMemoryRuntimeStore.RoomSnapshot room = runtimeStore.roomSnapshot(second.roomCode()).orElseThrow();
        assertEquals(InMemoryRuntimeStore.RoomStatus.IN_GAME, room.status());
        assertEquals("fem", room.selectedGame());
        assertEquals(2, room.participants().size());
    }
}
