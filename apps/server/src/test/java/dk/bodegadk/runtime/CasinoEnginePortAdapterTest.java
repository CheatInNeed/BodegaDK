package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class CasinoEnginePortAdapterTest {

    @Test
    void canSelectAnotherGameWhileStillInCasinoLobby() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        CasinoEnginePortAdapter adapter = new CasinoEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("casino", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        GameLoopService.RoomState state = store.refreshPlayers(roomCode);

        GameLoopService.ActionCommand command = new GameLoopService.ActionCommand(
                roomCode,
                "p1",
                "SELECT_GAME",
                JsonNodeFactory.instance.objectNode().put("game", "krig"),
                "req-select",
                Instant.now()
        );

        GameLoopService.LoopResult result = adapter.apply(state, command);

        assertFalse(result.isError());
        assertEquals("krig", result.publicUpdate().path("selectedGame").asText());
        assertEquals("LOBBY", result.publicUpdate().path("status").asText());
    }
}
