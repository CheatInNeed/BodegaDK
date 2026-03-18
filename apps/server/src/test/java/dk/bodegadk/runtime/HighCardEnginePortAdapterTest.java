package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HighCardEnginePortAdapterTest {

    @Test
    void returnsEngineNotReadyForUnsupportedGameType() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("snyd");
        store.joinRoom(roomCode, "p1", "token-p1");
        GameLoopService.RoomState state = store.refreshPlayers(roomCode);

        GameLoopService.LoopResult result = adapter.apply(state, command(roomCode, "p1", "HA"));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().startsWith("ENGINE_NOT_READY:"));
    }

    @Test
    void rejectsInvalidPlayCardsPayload() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("highcard");
        store.joinRoom(roomCode, "p1", "token-p1");
        GameLoopService.RoomState state = adapter.prepareSnapshot(store.refreshPlayers(roomCode), "p1");

        GameLoopService.ActionCommand invalid = new GameLoopService.ActionCommand(
                roomCode,
                "p1",
                "PLAY_CARDS",
                JsonNodeFactory.instance.objectNode().putArray("cards"),
                "req-invalid",
                Instant.now()
        );

        GameLoopService.LoopResult result = adapter.apply(state, invalid);

        assertTrue(result.isError());
        assertTrue(result.errorMessage().startsWith("BAD_MESSAGE:"));
    }

    @Test
    void appliesValidHighCardActionAndProducesPrivateUpdate() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("highcard");
        store.joinRoom(roomCode, "p1", "token-p1");

        GameLoopService.RoomState snapshot = service.prepareSnapshot(roomCode, "p1");
        String cardToPlay = snapshot.privateStateFor("p1").path("hand").get(0).asText();

        GameLoopService.LoopResult result = service.handleAction(command(roomCode, "p1", cardToPlay));

        assertFalse(result.isError());
        assertEquals(snapshot.version() + 1, result.nextState().version());
        assertNotNull(result.privateUpdates().get("p1"));
        assertTrue(result.publicUpdate().has("computerCard"));
    }

    @Test
    void prepareSnapshotContainsPlayerHand() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        String roomCode = store.createRoom("highcard");
        store.joinRoom(roomCode, "p1", "token-p1");

        GameLoopService.RoomState state = adapter.prepareSnapshot(store.refreshPlayers(roomCode), "p1");
        JsonNode privateState = state.privateStateFor("p1");

        assertNotNull(privateState);
        assertTrue(privateState.has("hand"));
        assertTrue(privateState.path("hand").isArray());
        assertTrue(privateState.path("hand").size() > 0);
    }

    private GameLoopService.ActionCommand command(String roomCode, String playerId, String cardCode) {
        ObjectNode payload = JsonNodeFactory.instance.objectNode();
        payload.putArray("cards").add(cardCode);
        payload.put("claimRank", "A");

        return new GameLoopService.ActionCommand(
                roomCode,
                playerId,
                "PLAY_CARDS",
                payload,
                "req-" + cardCode,
                Instant.now()
        );
    }
}
