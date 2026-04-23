package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LobbyCoordinatorTest {

    private static final List<String> LOBBY_ENABLED_GAMES = List.of("highcard", "krig", "casino", "snyd", "fem");

    @Test
    void anyLobbyEnabledGameCanTransitionToAnyOtherLobbyEnabledGame() {
        for (String sourceGame : LOBBY_ENABLED_GAMES) {
            for (String targetGame : LOBBY_ENABLED_GAMES) {
                InMemoryRuntimeStore store = new InMemoryRuntimeStore();
                GameLoopService service = new GameLoopService(store, List.of());

                String roomCode = store.createRoom(sourceGame, false, "p1");
                store.joinRoom(roomCode, "p1", null, "token-p1");

                GameLoopService.LoopResult result = service.handleAction(selectCommand(roomCode, targetGame));

                assertFalse(result.isError(), sourceGame + " -> " + targetGame + " should be allowed");
                assertEquals(targetGame, result.publicUpdate().path("selectedGame").asText());
                assertEquals("LOBBY", result.publicUpdate().path("status").asText());
                assertEquals(targetGame, store.roomSnapshot(roomCode).orElseThrow().selectedGame());
            }
        }
    }

    @Test
    void rejectsGamesThatExistButAreNotLobbyEnabled() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        GameLoopService service = new GameLoopService(store, List.of());

        String roomCode = store.createRoom("casino", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");

        GameLoopService.LoopResult result = service.handleAction(selectCommand(roomCode, "poker"));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().contains("Unsupported lobby game"));
        assertEquals("casino", store.roomSnapshot(roomCode).orElseThrow().selectedGame());
    }

    private GameLoopService.ActionCommand selectCommand(String roomCode, String gameType) {
        return new GameLoopService.ActionCommand(
                roomCode,
                "p1",
                "SELECT_GAME",
                JsonNodeFactory.instance.objectNode().put("game", gameType),
                "req-select-" + gameType,
                Instant.now()
        );
    }
}
