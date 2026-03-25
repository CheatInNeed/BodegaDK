package dk.bodegadk.ws;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.runtime.GameLoopService;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ServerLoopCoreTest {

    @Test
    void returnsEngineNotReadyWhenNoEngineIsConfigured() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        GameLoopService service = new GameLoopService(store, null);

        GameLoopService.LoopResult result = service.handleAction(command(1));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().startsWith("ENGINE_NOT_READY:"));
    }

    @Test
    void incrementsVersionWhenEngineReturnsSuccess() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        GameLoopService.EnginePort fakeEngine = new GameLoopService.EnginePort() {
            @Override
            public boolean supports(String roomCode) {
                return true;
            }

            @Override
            public GameLoopService.LoopResult apply(GameLoopService.RoomState state, GameLoopService.ActionCommand command) {
                ObjectNode nextPublic = state.publicState().deepCopy();
                nextPublic.put("turnPlayerId", "p2");
                GameLoopService.RoomState nextState = new GameLoopService.RoomState(
                        state.roomCode(),
                        state.version(),
                        nextPublic,
                        Map.of()
                );
                return GameLoopService.LoopResult.success(nextState, JsonNodeFactory.instance.objectNode(), Map.of(), false, null);
            }
        };

        GameLoopService service = new GameLoopService(store, java.util.List.of(fakeEngine));
        store.createRoom("SNYD");

        GameLoopService.LoopResult result = service.handleAction(command(2));

        assertEquals(1, result.nextState().version());
    }

    private GameLoopService.ActionCommand command(int seq) {
        return new GameLoopService.ActionCommand(
                "ROOM1",
                "p1",
                "PLAY_CARDS",
                JsonNodeFactory.instance.objectNode().put("seq", seq),
                "req-" + seq,
                Instant.now()
        );
    }
}
