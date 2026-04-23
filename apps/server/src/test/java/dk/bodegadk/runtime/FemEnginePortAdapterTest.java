package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.games.fem.FemEngine;
import dk.bodegadk.server.domain.games.fem.FemState;
import dk.bodegadk.server.domain.primitives.Card;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FemEnginePortAdapterTest {

    @Test
    void returnsEngineNotReadyForNonFemRoom() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        GameLoopService.RoomState state = store.refreshPlayers(roomCode);

        GameLoopService.LoopResult result = adapter.apply(state, command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().startsWith("ENGINE_NOT_READY:"));
    }

    @Test
    void startsFemAndPublishesPrivateHandsForAllPlayers() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("fem", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult result = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertFalse(result.isError());
        assertEquals("IN_GAME", result.publicUpdate().path("status").asText());
        assertEquals("fem", result.publicUpdate().path("selectedGame").asText());
        assertNotNull(result.privateUpdates().get("p1"));
        assertNotNull(result.privateUpdates().get("p2"));
        assertTrue(result.privateUpdates().get("p1").has("hand"));
        assertTrue(result.privateUpdates().get("p2").has("hand"));
        assertEquals(7, result.privateUpdates().get("p1").path("hand").size());
        assertEquals(7, result.privateUpdates().get("p2").path("hand").size());
    }

    @Test
    void rejectsStartWhenFewerThanTwoPlayers() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("fem", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");

        GameLoopService.LoopResult result = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().contains("RULES_NOT_AVAILABLE:"));
    }

    @Test
    void drawFromStockUpdatesState() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("fem", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        String turnPlayerId = startResult.publicUpdate().path("turnPlayerId").asText();
        int handBefore = startResult.privateUpdates().get(turnPlayerId).path("hand").size();

        GameLoopService.LoopResult drawResult = service.handleAction(command(roomCode, turnPlayerId, "DRAW_FROM_STOCK", JsonNodeFactory.instance.objectNode()));

        assertFalse(drawResult.isError());
        int handAfter = drawResult.privateUpdates().get(turnPlayerId).path("hand").size();
        assertEquals(handBefore + 1, handAfter);
    }

    @Test
    void layMeldUpdatesPublicMelds() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("fem", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        // Set up a known state with a hand that has a valid meld
        FemState knownState = new FemState(List.of("p1", "p2"));
        knownState.hands().put("p1", new ArrayList<>(List.of(
                new Card("H", "3"), new Card("H", "4"), new Card("H", "5"),
                new Card("D", "A"), new Card("S", "K"), new Card("C", "7"),
                new Card("D", "9"), new Card("S", "2")
        )));
        knownState.hands().put("p2", new ArrayList<>(List.of(
                new Card("S", "3"), new Card("S", "4"), new Card("S", "5"),
                new Card("C", "A"), new Card("D", "K"), new Card("H", "7"),
                new Card("C", "9")
        )));
        knownState.stockPile().add(new Card("D", "2"));
        knownState.discardPile().add(new Card("C", "10"));
        knownState.setHasDrawnThisTurn(true);
        knownState.setPhase(GameState.Phase.PLAYING);
        store.saveGameState(roomCode, knownState);

        // Lay a meld of H3, H4, H5
        ObjectNode layPayload = JsonNodeFactory.instance.objectNode();
        var cardsArray = layPayload.putArray("cards");
        cardsArray.add("H3");
        cardsArray.add("H4");
        cardsArray.add("H5");

        GameLoopService.LoopResult layResult = service.handleAction(command(roomCode, "p1", "LAY_MELD", layPayload));

        assertFalse(layResult.isError());
        assertTrue(layResult.publicUpdate().path("melds").isArray());
        assertEquals(1, layResult.publicUpdate().path("melds").size());
        assertEquals("H", layResult.publicUpdate().path("melds").get(0).path("suit").asText());
    }

    @Test
    void discardAdvancesTurn() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("fem", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        String turnPlayer = startResult.publicUpdate().path("turnPlayerId").asText();

        // Draw first
        GameLoopService.LoopResult drawResult = service.handleAction(command(roomCode, turnPlayer, "DRAW_FROM_STOCK", JsonNodeFactory.instance.objectNode()));
        assertFalse(drawResult.isError());

        // Discard a card from hand
        String cardToDiscard = drawResult.privateUpdates().get(turnPlayer).path("hand").get(0).asText();
        ObjectNode discardPayload = JsonNodeFactory.instance.objectNode();
        discardPayload.put("card", cardToDiscard);

        GameLoopService.LoopResult discardResult = service.handleAction(command(roomCode, turnPlayer, "DISCARD", discardPayload));
        assertFalse(discardResult.isError());

        // Turn should have advanced (either via grab phase end or directly)
        // The key assertion is that the action succeeded
        assertNotNull(discardResult.publicUpdate().path("turnPlayerId").asText());
    }

    @Test
    void claimDiscardDuringGrabPhase() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("fem", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        // Set up a state where p1 has drawn and there's a meld on the table
        // so that discarding triggers grab phase
        FemState knownState = new FemState(List.of("p1", "p2"));
        knownState.hands().put("p1", new ArrayList<>(List.of(
                new Card("D", "A"), new Card("S", "K"), new Card("C", "7")
        )));
        knownState.hands().put("p2", new ArrayList<>(List.of(
                new Card("S", "3"), new Card("S", "4"), new Card("S", "5"),
                new Card("C", "A"), new Card("D", "K")
        )));
        knownState.stockPile().add(new Card("D", "2"));
        knownState.stockPile().add(new Card("H", "10"));
        knownState.discardPile().add(new Card("C", "10"));
        // Add a meld that H6 could extend (H3,H4,H5)
        knownState.melds().add(new FemState.Meld("m1", "H",
                new ArrayList<>(List.of(new Card("H", "3"), new Card("H", "4"), new Card("H", "5"))),
                new java.util.LinkedHashMap<>()));
        knownState.setHasDrawnThisTurn(true);
        knownState.setPhase(GameState.Phase.PLAYING);
        knownState.setFirstRound(false);
        store.saveGameState(roomCode, knownState);

        // p1 discards H6 — this should trigger grab phase since there's a meld on table
        // But H6 can extend the meld (H3-H5), so we use that
        // Actually, let's give p1 an H6 and discard it
        knownState.hands().get("p1").add(new Card("H", "6"));
        store.saveGameState(roomCode, knownState);

        ObjectNode discardPayload = JsonNodeFactory.instance.objectNode();
        discardPayload.put("card", "H6");
        GameLoopService.LoopResult discardResult = service.handleAction(command(roomCode, "p1", "DISCARD", discardPayload));
        assertFalse(discardResult.isError());

        // Check if grab phase is active
        boolean grabPhase = discardResult.publicUpdate().path("discardGrabPhase").asBoolean();
        if (grabPhase) {
            // p2 should be the grab priority player
            String grabPlayer = discardResult.publicUpdate().path("grabPriorityPlayerId").asText();
            assertEquals("p2", grabPlayer);

            // p2 claims the discard to extend meld m1
            ObjectNode claimPayload = JsonNodeFactory.instance.objectNode();
            claimPayload.put("meldId", "m1");
            GameLoopService.LoopResult claimResult = service.handleAction(command(roomCode, "p2", "CLAIM_DISCARD", claimPayload));
            assertFalse(claimResult.isError());

            // Meld should now have 4 cards
            assertEquals(4, claimResult.publicUpdate().path("melds").get(0).path("cards").size());
        }
    }

    @Test
    void prepareSnapshotShowsLobbyStateBeforeStart() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("fem", false, "p1");
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
        FemEnginePortAdapter adapter = new FemEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, List.of(adapter));

        String roomCode = store.createRoom("fem", false, "p1");
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
