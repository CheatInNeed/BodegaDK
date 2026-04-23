package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CasinoEnginePortAdapterTest {

    @Test
    void lobbyCoordinatorDefersEngineResolutionUntilStartGame() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        CasinoEnginePortAdapter adapter = new CasinoEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("casino", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.ActionCommand selectCommand = new GameLoopService.ActionCommand(
                roomCode,
                "p1",
                "SELECT_GAME",
                JsonNodeFactory.instance.objectNode().put("game", "krig"),
                "req-select",
                Instant.now()
        );

        GameLoopService.LoopResult selectResult = service.handleAction(selectCommand);

        assertFalse(selectResult.isError());
        assertEquals("krig", selectResult.publicUpdate().path("selectedGame").asText());
        assertEquals("LOBBY", selectResult.publicUpdate().path("status").asText());

        GameLoopService.LoopResult startResult = service.handleAction(new GameLoopService.ActionCommand(
                roomCode,
                "p1",
                "START_GAME",
                JsonNodeFactory.instance.objectNode(),
                "req-start",
                Instant.now()
        ));

        assertTrue(startResult.isError());
        assertTrue(startResult.errorMessage().startsWith("ENGINE_NOT_READY:"));
    }
}
