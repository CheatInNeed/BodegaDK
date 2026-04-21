package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.games.krig.KrigState;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

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
        store.joinRoom(roomCode, "p1", null, "token-p1");
        GameLoopService.RoomState state = store.refreshPlayers(roomCode);

        GameLoopService.LoopResult result = adapter.apply(state, playCommand(roomCode, "p1", "HA"));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().startsWith("ENGINE_NOT_READY:"));
    }

    @Test
    void rejectsInvalidPlayCardsPayloadAfterHighCardStarts() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        GameLoopService.ActionCommand invalid = new GameLoopService.ActionCommand(
                roomCode,
                "p1",
                "PLAY_CARDS",
                JsonNodeFactory.instance.objectNode().putArray("cards"),
                "req-invalid",
                Instant.now()
        );

        GameLoopService.LoopResult result = adapter.apply(startResult.nextState(), invalid);

        assertTrue(result.isError());
        assertTrue(result.errorMessage().startsWith("BAD_MESSAGE:"));
    }

    @Test
    void appliesValidHighCardActionAndProducesPrivateUpdate() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        GameLoopService.RoomState snapshot = service.prepareSnapshot(roomCode, "p1");
        String cardToPlay = snapshot.privateStateFor("p1").path("hand").get(0).asText();

        GameLoopService.LoopResult result = service.handleAction(playCommand(roomCode, "p1", cardToPlay));

        assertFalse(result.isError());
        assertEquals(snapshot.version() + 1, result.nextState().version());
        assertNotNull(result.privateUpdates().get("p1"));
        assertTrue(result.publicUpdate().has("computerCard"));
        assertEquals("IN_GAME", result.publicUpdate().path("status").asText());
    }

    @Test
    void prepareSnapshotContainsPlayerHandAfterStart() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertFalse(startResult.isError());

        GameLoopService.RoomState state = adapter.prepareSnapshot(store.refreshPlayers(roomCode), "p1");
        JsonNode privateState = state.privateStateFor("p1");

        assertNotNull(privateState);
        assertTrue(privateState.has("hand"));
        assertTrue(privateState.path("hand").isArray());
        assertTrue(privateState.path("hand").size() > 0);
    }

    @Test
    void prepareSnapshotContainsPlayerIdentityWhileStillInLobby() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());

        String roomCode = store.createRoom("highcard", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.RoomState state = adapter.prepareSnapshot(store.refreshPlayers(roomCode), "p1");
        JsonNode privateState = state.privateStateFor("p1");

        assertNotNull(privateState);
        assertEquals("p1", privateState.path("playerId").asText());
        assertEquals("p1", state.publicState().path("hostPlayerId").asText());
        assertEquals("LOBBY", state.publicState().path("status").asText());
    }

    @Test
    void rejectsKrigStartWhenPlayerCountIsNotExactlyTwo() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("krig", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");

        GameLoopService.LoopResult result = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertTrue(result.isError());
        assertTrue(result.errorMessage().contains("Krig requires exactly 2 players."));
    }

    @Test
    void startsKrigAndPublishesPrivatePileCountsForBothPlayers() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("krig", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult result = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));

        assertFalse(result.isError());
        assertEquals("IN_GAME", result.publicUpdate().path("status").asText());
        assertNotNull(result.privateUpdates().get("p1"));
        assertNotNull(result.privateUpdates().get("p2"));
        assertEquals("krig", result.publicUpdate().path("selectedGame").asText());
        assertEquals(26, result.publicUpdate().path("drawPileCounts").path("p1").asInt());
        assertEquals(26, result.publicUpdate().path("drawPileCounts").path("p2").asInt());
        assertEquals(26, result.privateUpdates().get("p1").path("drawPileCount").asInt());
    }

    @Test
    void krigFirstFlipBroadcastsReadyStateWithoutLeakingCardValue() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("krig", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        GameLoopService.LoopResult playResult = service.handleAction(flipCommand(roomCode, "p1"));

        assertFalse(playResult.isError());
        assertTrue(playResult.publicUpdate().path("readyPlayerIds").isArray());
        assertEquals(1, playResult.publicUpdate().path("readyPlayerIds").size());
        assertEquals("p1", playResult.publicUpdate().path("readyPlayerIds").get(0).asText());
        assertTrue(playResult.publicUpdate().path("currentFaceUpCards").isObject());
        assertTrue(playResult.publicUpdate().path("currentFaceUpCards").path("p1").isNull());
        assertTrue(playResult.publicUpdate().path("lastTrick").isNull());
        assertEquals(26, playResult.publicUpdate().path("drawPileCounts").path("p1").asInt());
    }

    @Test
    void krigSecondFlipRevealsCardsAfterBothPlayersLockIn() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("krig", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");

        GameLoopService.LoopResult startResult = service.handleAction(command(roomCode, "p1", "START_GAME", JsonNodeFactory.instance.objectNode()));
        assertFalse(startResult.isError());

        GameLoopService.LoopResult waitingResult = service.handleAction(flipCommand(roomCode, "p1"));
        assertFalse(waitingResult.isError());

        GameLoopService.LoopResult resolvedResult = service.handleAction(flipCommand(roomCode, "p2"));
        assertFalse(resolvedResult.isError());

        assertEquals(0, resolvedResult.publicUpdate().path("readyPlayerIds").size());
        assertTrue(resolvedResult.publicUpdate().path("currentFaceUpCards").path("p1").isTextual());
        assertTrue(resolvedResult.publicUpdate().path("currentFaceUpCards").path("p2").isTextual());
        assertEquals(1, resolvedResult.publicUpdate().path("lastTrick").path("trickNumber").asInt());
        assertTrue(resolvedResult.publicUpdate().path("lastTrick").has("winnerPlayerId"));
        assertEquals(52, resolvedResult.publicUpdate().path("drawPileCounts").path("p1").asInt()
                + resolvedResult.publicUpdate().path("drawPileCounts").path("p2").asInt());
    }

    @Test
    void krigRematchVoteWaitsForOpponentAndThenResetsMatch() {
        InMemoryRuntimeStore store = new InMemoryRuntimeStore();
        HighCardEnginePortAdapter adapter = new HighCardEnginePortAdapter(store, new ObjectMapper());
        GameLoopService service = new GameLoopService(store, java.util.List.of(adapter));

        String roomCode = store.createRoom("krig", false, "p1");
        store.joinRoom(roomCode, "p1", null, "token-p1");
        store.joinRoom(roomCode, "p2", null, "token-p2");
        store.markRoomInGame(roomCode, "p1");

        KrigState finished = new KrigState(List.of("p1", "p2"));
        finished.setPhase(GameState.Phase.FINISHED);
        finished.drawPiles().put("p1", new java.util.ArrayList<>());
        finished.drawPiles().put("p2", new java.util.ArrayList<>());
        finished.drawPiles().get("p1").add(new dk.bodegadk.server.domain.primitives.Card("H", "A"));
        finished.setWinnerPlayerId("p1");
        store.saveKrigState(roomCode, finished);

        GameLoopService.LoopResult firstVote = service.handleAction(command(roomCode, "p1", "REQUEST_REMATCH", JsonNodeFactory.instance.objectNode()));
        assertFalse(firstVote.isError());
        assertEquals("GAME_OVER", firstVote.publicUpdate().path("gamePhase").asText());
        assertEquals(1, firstVote.publicUpdate().path("rematchPlayerIds").size());
        assertEquals("p1", firstVote.publicUpdate().path("rematchPlayerIds").get(0).asText());

        GameLoopService.LoopResult secondVote = service.handleAction(command(roomCode, "p2", "REQUEST_REMATCH", JsonNodeFactory.instance.objectNode()));
        assertFalse(secondVote.isError());
        assertEquals("PLAYING", secondVote.publicUpdate().path("gamePhase").asText());
        assertEquals(1, secondVote.publicUpdate().path("trickNumber").asInt());
        assertEquals(26, secondVote.publicUpdate().path("drawPileCounts").path("p1").asInt());
        assertEquals(26, secondVote.publicUpdate().path("drawPileCounts").path("p2").asInt());
        assertEquals(26, secondVote.privateUpdates().get("p1").path("drawPileCount").asInt());
        assertEquals(26, secondVote.privateUpdates().get("p2").path("drawPileCount").asInt());
    }

    private GameLoopService.ActionCommand flipCommand(String roomCode, String playerId) {
        return command(roomCode, playerId, "FLIP_CARD", JsonNodeFactory.instance.objectNode());
    }

    private GameLoopService.ActionCommand playCommand(String roomCode, String playerId, String cardCode) {
        ObjectNode payload = JsonNodeFactory.instance.objectNode();
        payload.putArray("cards").add(cardCode);
        payload.put("claimRank", "A");
        return command(roomCode, playerId, "PLAY_CARDS", payload);
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
