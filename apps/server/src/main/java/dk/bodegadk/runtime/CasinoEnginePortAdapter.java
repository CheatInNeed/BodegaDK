package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.games.casino.CasinoAction;
import dk.bodegadk.server.domain.games.casino.CasinoEngine;
import dk.bodegadk.server.domain.games.casino.CasinoState;
import dk.bodegadk.server.domain.games.casino.CasinoViewProjector;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
public class CasinoEnginePortAdapter implements GameLoopService.EnginePort {
    private static final String CASINO_GAME_TYPE = "casino";

    private final InMemoryRuntimeStore runtimeStore;
    private final ObjectMapper objectMapper;
    private final CasinoEngine engine = new CasinoEngine();
    private final CasinoViewProjector projector = new CasinoViewProjector();

    public CasinoEnginePortAdapter(InMemoryRuntimeStore runtimeStore, ObjectMapper objectMapper) {
        this.runtimeStore = runtimeStore;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean supports(String roomCode) {
        Optional<String> gameType = runtimeStore.roomGameType(roomCode);
        return gameType.map(value -> value.toLowerCase(Locale.ROOT)).filter(CASINO_GAME_TYPE::equals).isPresent();
    }

    @Override
    public GameLoopService.LoopResult apply(GameLoopService.RoomState state, GameLoopService.ActionCommand command) {
        if (!supports(command.roomCode())) {
            return GameLoopService.LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        }
        if (!runtimeStore.isParticipant(command.roomCode(), command.playerId())) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }

        CasinoAction action = parseAction(command);
        if (action == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        CasinoState current = loadCasinoState(command.roomCode());
        CasinoState next;
        try {
            next = engine.apply(action, current);
        } catch (GameEngine.GameRuleException exception) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }

        runtimeStore.saveCasinoState(command.roomCode(), next);
        GameLoopService.RoomState nextRoomState = toRoomState(state.version(), command.roomCode(), next);

        return GameLoopService.LoopResult.success(
                nextRoomState,
                nextRoomState.publicState(),
                new HashMap<>(nextRoomState.privateStateByPlayer()),
                engine.isFinished(next),
                engine.getWinner(next)
        );
    }

    @Override
    public GameLoopService.RoomState prepareSnapshot(GameLoopService.RoomState state, String playerId) {
        if (!supports(state.roomCode()) || !runtimeStore.isParticipant(state.roomCode(), playerId)) {
            return state;
        }

        CasinoState current = loadCasinoState(state.roomCode());
        return toRoomState(state.version(), state.roomCode(), current);
    }

    private CasinoState loadCasinoState(String roomCode) {
        CasinoState state = runtimeStore.loadOrCreateCasinoState(roomCode, () -> {
            List<String> participants = runtimeStore.participants(roomCode);
            if (participants.size() < 2) {
                Map<String, List<Integer>> rules = runtimeStore.casinoValueMap(roomCode).orElse(CasinoEngine.defaultValueMap());
                String dealer = participants.size() > 1 ? participants.get(1) : "p2";
                return new CasinoState(roomCode, List.of("p1", "p2"), dealer, rules);
            }
            Map<String, List<Integer>> rules = runtimeStore.casinoValueMap(roomCode)
                    .orElseThrow(() -> new GameEngine.GameRuleException("Missing setup.casinoRules.valueMap"));
            return engine.init(roomCode, List.copyOf(participants), participants.get(1), rules);
        });

        List<String> participants = runtimeStore.participants(roomCode);
        if (!state.started() && participants.size() == 2) {
            Map<String, List<Integer>> rules = runtimeStore.casinoValueMap(roomCode)
                    .orElseThrow(() -> new GameEngine.GameRuleException("Missing setup.casinoRules.valueMap"));
            state = engine.init(roomCode, List.copyOf(participants), participants.get(1), rules);
            runtimeStore.saveCasinoState(roomCode, state);
        }
        return state;
    }

    private CasinoAction parseAction(GameLoopService.ActionCommand command) {
        JsonNode payload = command.payloadRaw();
        return switch (command.type()) {
            case "CASINO_PLAY_MOVE" -> {
                String handCard = readText(payload, "handCard");
                if (handCard == null) {
                    yield null;
                }
                yield new CasinoAction.PlayMove(
                        command.playerId(),
                        handCard,
                        readStringList(payload.path("captureStackIds")),
                        readInt(payload.get("playedValue"))
                );
            }
            case "CASINO_BUILD_STACK" -> {
                String handCard = readText(payload, "handCard");
                String targetStackId = readText(payload, "targetStackId");
                if (handCard == null || targetStackId == null) {
                    yield null;
                }
                yield new CasinoAction.BuildStack(
                        command.playerId(),
                        handCard,
                        targetStackId,
                        readInt(payload.get("playedValue"))
                );
            }
            case "CASINO_MERGE_STACKS" -> {
                List<String> stackIds = readStringList(payload.path("stackIds"));
                if (stackIds.isEmpty()) {
                    yield null;
                }
                yield new CasinoAction.MergeStacks(command.playerId(), stackIds);
            }
            default -> null;
        };
    }

    private GameLoopService.RoomState toRoomState(long version, String roomCode, CasinoState gameState) {
        ObjectNode publicState = objectMapper.valueToTree(projector.toPublicView(gameState));
        publicState.put("roomCode", roomCode);
        publicState.put("version", version);

        Map<String, ObjectNode> privateStateByPlayer = new LinkedHashMap<>();
        for (String playerId : runtimeStore.participants(roomCode)) {
            privateStateByPlayer.put(playerId, objectMapper.valueToTree(projector.toPrivateView(gameState, playerId)));
        }

        return new GameLoopService.RoomState(roomCode, version, publicState, privateStateByPlayer);
    }

    private String readText(JsonNode payload, String field) {
        JsonNode node = payload == null ? null : payload.get(field);
        return node != null && node.isTextual() ? node.asText() : null;
    }

    private Integer readInt(JsonNode node) {
        return node != null && node.isInt() ? node.asInt() : null;
    }

    private List<String> readStringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new java.util.ArrayList<>();
        node.forEach(item -> {
            if (item.isTextual()) {
                values.add(item.asText());
            }
        });
        return List.copyOf(values);
    }
}
