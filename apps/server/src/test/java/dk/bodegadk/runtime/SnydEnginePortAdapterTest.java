package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.games.snyd.SnydState;
import dk.bodegadk.server.domain.primitives.Card;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SnydEnginePortAdapterTest {

    @Test
    void returnsEngineNotReadyForNonSnydRoom() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        GameLoopService.RoomState state = store.refreshPlayers(roomCode);

        GameLoopService.LoopResult result = adapter.apply(state, command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().startsWith("ENGINE_NOT_READY:"));
    }

    @Test
    void startsSnydAndPublishesPrivateHandsForAllPlayers() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult result = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertFalse(result.isError());
        assertEquals("IN_GAME", result.publicUpdate().path("status").asText());
        assertEquals("snyd", result.publicUpdate().path("selectedGame").asText());
        assertNotNull(result.privateUpdates().get("p1"));
        assertNotNull(result.privateUpdates().get("p2"));
        assertTrue(result.privateUpdates().get("p1").has("hand"));
        assertTrue(result.privateUpdates().get("p2").has("hand"));
    }

    @Test
    void rejectsStartWhenFewerThanTwoPlayers() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");

        GameLoopService.LoopResult result = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().contains("RULES_NOT_AVAILABLE:"));
    }

    @Test
    void appliesPlayCardsAndUpdatesState() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        String firstCard = startResult.privateUpdates().get("p1").path("hand").get(0).asText();
        int handSizeBefore = startResult.privateUpdates().get("p1").path("hand").size();

        GameLoopService.LoopResult playResult = service.handleAction(playCardsCommand(roomCode, "p1", List.of(firstCard), "A"));

        assertFalse(playResult.isError());
        assertEquals(1, playResult.publicUpdate().path("pileCount").asInt());
        int handSizeAfter = playResult.privateUpdates().get("p1").path("hand").size();
        assertEquals(handSizeBefore - 1, handSizeAfter);
    }

    @Test
    void appliesCallSnydOnLiarAndResolves() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        // Start game then set up known state
        service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        SnydState knownState = buildKnownState();
        store.saveGameState(roomCode, knownState);

        // p1 plays H7, claims "A" (lie — it's a 7)
        GameLoopService.LoopResult playResult = service.handleAction(playCardsCommand(roomCode, "p1", List.of("H7"), "A"));
        assertFalse(playResult.isError());

        // p2 calls snyd — p1 lied, so p1 picks up pile
        GameLoopService.LoopResult callResult = service.handleAction(callSnydCommand(roomCode, "p2"));
        assertFalse(callResult.isError());
        assertEquals(0, callResult.publicUpdate().path("pileCount").asInt());
        // liar (p1) gets the pile back, so p1's hand grows
        assertTrue(callResult.privateUpdates().get("p1").path("hand").size() > 0);
    }

    @Test
    void appliesCallSnydOnTruthAndResolves() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        // Start game then set up known state
        service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        SnydState knownState = buildKnownState();
        store.saveGameState(roomCode, knownState);

        // p1 plays H7, truthfully claims "7"
        GameLoopService.LoopResult playResult = service.handleAction(playCardsCommand(roomCode, "p1", List.of("H7"), "7"));
        assertFalse(playResult.isError());

        // p2 calls snyd — p1 was truthful, so p2 picks up pile
        GameLoopService.LoopResult callResult = service.handleAction(callSnydCommand(roomCode, "p2"));
        assertFalse(callResult.isError());
        assertEquals(0, callResult.publicUpdate().path("pileCount").asInt());
        // challenger (p2) gets the pile, so p2's hand grows
        assertTrue(callResult.privateUpdates().get("p2").path("hand").size() > 2);
    }

    @Test
    void prepareSnapshotShowsLobbyStateBeforeStart() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.RoomState state = adapter.prepareSnapshot(store.refreshPlayers(roomCode), "p1");
        JsonNode privateState = state.privateStateFor("p1");

        assertNotNull(privateState);
        assertEquals("p1", privateState.path("playerId").asText());
        assertEquals("LOBBY", state.publicState().path("status").asText());
    }

    @Test
    void prepareSnapshotShowsHandAfterStart() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        SnydEnginePortAdapter adapter = new SnydEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("snyd", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        GameLoopService.RoomState state = adapter.prepareSnapshot(store.refreshPlayers(roomCode), "p1");
        JsonNode privateState = state.privateStateFor("p1");

        assertNotNull(privateState);
        assertTrue(privateState.has("hand"));
        assertTrue(privateState.path("hand").isArray());
        assertTrue(privateState.path("hand").size() > 0);
    }

    /* ── helpers ── */

    private SnydState buildKnownState() {
        SnydState state = new SnydState(List.of("p1", "p2"));
        state.hands().put("p1", new ArrayList<>(List.of(new Card("H", "7"), new Card("D", "A"))));
        state.hands().put("p2", new ArrayList<>(List.of(new Card("S", "K"), new Card("C", "3"))));
        state.setPhase(GameState.Phase.PLAYING);
        return state;
    }

    private GameLoopService.ActionCommand playCardsCommand(String roomCode, String playerId, List<String> cards, String claimRank) {
        ObjectNode payload = JsonNodeFactory.instance.objectNode();
        var cardsArray = payload.putArray("cards");
        cards.forEach(cardsArray::add);
        payload.put("claimRank", claimRank);
        return command(roomCode, playerId, "PLAY_CARDS", payload);
    }

    private GameLoopService.ActionCommand callSnydCommand(String roomCode, String playerId) {
        return command(roomCode, playerId, "CALL_SNYD", JsonNodeFactory.instance.objectNode());
    }

    private GameLoopService.ActionCommand command(String roomCode, String playerId, String type, ObjectNode payload) {
        return new GameLoopService.ActionCommand(
                roomCode,
                playerId,
                type,
                payload,
                "req-" + type + "-" + playerId,
                Instant.now()
        );
    }
}
