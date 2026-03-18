package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.games.highcard.HighCardAction;
import dk.bodegadk.server.domain.games.highcard.HighCardEngine;
import dk.bodegadk.server.domain.games.highcard.HighCardState;
import dk.bodegadk.server.domain.games.highcard.HighCardViewProjector;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
public class HighCardEnginePortAdapter implements GameLoopService.EnginePort {
    private static final String HIGHCARD_GAME_TYPE = "highcard";

    private final InMemoryRuntimeStore runtimeStore;
    private final ObjectMapper objectMapper;

    // TEAM-ENGINE-INTEGRATION: replace direct wiring with an engine registry when multiple games are integrated.
    private final HighCardEngine engine = new HighCardEngine();
    private final HighCardViewProjector projector = new HighCardViewProjector();

    public HighCardEnginePortAdapter(InMemoryRuntimeStore runtimeStore, ObjectMapper objectMapper) {
        this.runtimeStore = runtimeStore;
        this.objectMapper = objectMapper;
    }

    @Override
    public GameLoopService.LoopResult apply(GameLoopService.RoomState state, GameLoopService.ActionCommand command) {
        if (!isHighCardRoom(command.roomCode())) {
            return GameLoopService.LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        }
        if (!runtimeStore.isParticipant(command.roomCode(), command.playerId())) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }
        if (!"PLAY_CARDS".equals(command.type())) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        String cardCode = parseSingleCard(command.payloadRaw());
        if (cardCode == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        HighCardState current = runtimeStore.loadOrCreateHighCardState(
                command.roomCode(),
                () -> initHighCardState(command.roomCode(), command.playerId())
        );
        if (!isAllowedActor(current, command.playerId())) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: highcard supports exactly one active player");
        }

        HighCardState next;
        try {
            next = engine.apply(new HighCardAction(command.playerId(), cardCode), current);
        } catch (GameEngine.GameRuleException ruleException) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + ruleException.getMessage());
        }

        runtimeStore.saveHighCardState(command.roomCode(), next);
        GameLoopService.RoomState nextRoomState = toRoomState(state, command.roomCode(), command.playerId(), next);

        Map<String, JsonNode> privateUpdates = new HashMap<>();
        JsonNode privateForPlayer = nextRoomState.privateStateFor(command.playerId());
        if (privateForPlayer != null) {
            privateUpdates.put(command.playerId(), privateForPlayer);
        }

        return GameLoopService.LoopResult.success(
                nextRoomState,
                nextRoomState.publicState(),
                privateUpdates,
                engine.isFinished(next),
                engine.getWinner(next)
        );
    }

    @Override
    public GameLoopService.RoomState prepareSnapshot(GameLoopService.RoomState state, String playerId) {
        if (!isHighCardRoom(state.roomCode())) {
            return state;
        }
        if (!runtimeStore.isParticipant(state.roomCode(), playerId)) {
            return state;
        }

        HighCardState current = runtimeStore.loadOrCreateHighCardState(
                state.roomCode(),
                () -> initHighCardState(state.roomCode(), playerId)
        );
        if (!isAllowedActor(current, playerId)) {
            return state;
        }
        return toRoomState(state, state.roomCode(), playerId, current);
    }

    private boolean isHighCardRoom(String roomCode) {
        Optional<String> gameType = runtimeStore.roomGameType(roomCode);
        return gameType
                .map(value -> value.toLowerCase(Locale.ROOT))
                .filter(HIGHCARD_GAME_TYPE::equals)
                .isPresent();
    }

    private HighCardState initHighCardState(String roomCode, String fallbackPlayerId) {
        List<String> participants = runtimeStore.participants(roomCode);
        String playerId = participants.isEmpty() ? fallbackPlayerId : participants.getFirst();
        return engine.init(List.of(playerId));
    }

    private String parseSingleCard(JsonNode payload) {
        JsonNode cards = payload == null ? null : payload.path("cards");
        if (cards == null || !cards.isArray() || cards.size() != 1 || !cards.get(0).isTextual()) {
            return null;
        }
        return cards.get(0).asText();
    }

    private boolean isAllowedActor(HighCardState state, String playerId) {
        return !state.playerIds().isEmpty() && state.playerIds().getFirst().equals(playerId);
    }

    private GameLoopService.RoomState toRoomState(
            GameLoopService.RoomState base,
            String roomCode,
            String playerId,
            HighCardState gameState
    ) {
        ObjectNode publicState = objectMapper.valueToTree(projector.toPublicView(gameState));
        publicState.put("roomCode", roomCode);
        publicState.put("version", base.version());

        ArrayNode players = objectMapper.createArrayNode();
        runtimeStore.participants(roomCode).forEach(players::add);
        publicState.set("players", players);

        ObjectNode privateState = objectMapper.valueToTree(projector.toPrivateView(gameState, playerId));
        Map<String, ObjectNode> privateStateByPlayer = new HashMap<>();
        privateStateByPlayer.put(playerId, privateState);

        return new GameLoopService.RoomState(roomCode, base.version(), publicState, privateStateByPlayer);
    }
}
