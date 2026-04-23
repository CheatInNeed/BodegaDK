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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
public class CasinoEnginePortAdapter implements GameLoopService.EnginePort {
    private static final String CASINO_GAME_TYPE = "casino";
    private static final String START_GAME = "START_GAME";
    private static final String CASINO_VALUE_MAP_KEY = "casinoValueMap";

    private final InMemoryRuntimeStore runtimeStore;
    private final ObjectMapper objectMapper;
    private final CasinoEngine engine = new CasinoEngine();
    private final CasinoViewProjector projector = new CasinoViewProjector();

    public CasinoEnginePortAdapter(InMemoryRuntimeStore runtimeStore, ObjectMapper objectMapper) {
        this.runtimeStore = runtimeStore;
        this.objectMapper = objectMapper;
        runtimeStore.registerMaxPlayers(CASINO_GAME_TYPE, 2);
    }

    @Override
    public boolean supports(String roomCode) {
        Optional<String> gameType = runtimeStore.roomGameType(roomCode);
        return gameType.map(value -> value.toLowerCase(Locale.ROOT)).filter(CASINO_GAME_TYPE::equals).isPresent();
    }

    @Override
    public Optional<String> onConnect(String roomCode, JsonNode connectPayload) {
        if (!supports(roomCode)) {
            return Optional.empty();
        }
        Map<String, List<Integer>> valueMap = parseCasinoValueMap(
                connectPayload.path("setup").path("casinoRules").path("valueMap")
        );
        String validationError = CasinoEngine.validateValueMap(valueMap);
        if (validationError != null) {
            return Optional.of(validationError);
        }
        runtimeStore.putGameConfig(roomCode, CASINO_VALUE_MAP_KEY, valueMap);
        return Optional.empty();
    }

    @Override
    public GameLoopService.LoopResult apply(GameLoopService.RoomState state, GameLoopService.ActionCommand command) {
        if (!supports(command.roomCode())) {
            return GameLoopService.LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        }
        if (!runtimeStore.isParticipant(command.roomCode(), command.playerId())) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }

        Optional<InMemoryRuntimeStore.RoomSnapshot> roomOptional = runtimeStore.roomSnapshot(command.roomCode());
        if (roomOptional.isEmpty()) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }
        InMemoryRuntimeStore.RoomSnapshot room = roomOptional.get();

        if (START_GAME.equals(command.type())) {
            return handleStartGame(state, command, room);
        }
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        CasinoAction action = parseAction(command);
        if (action == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        CasinoState current = loadCasinoState(command.roomCode())
                .orElseThrow(() -> new GameEngine.GameRuleException("Casino state missing"));
        CasinoState next;
        try {
            next = engine.apply(action, current);
        } catch (GameEngine.GameRuleException exception) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }

        runtimeStore.saveGameState(command.roomCode(), next);
        GameLoopService.RoomState nextRoomState = toRoomState(state.version(), room, next);

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

        Optional<InMemoryRuntimeStore.RoomSnapshot> roomOptional = runtimeStore.roomSnapshot(state.roomCode());
        if (roomOptional.isEmpty()) {
            return state;
        }
        InMemoryRuntimeStore.RoomSnapshot room = roomOptional.get();
        if (room.status() == InMemoryRuntimeStore.RoomStatus.LOBBY) {
            return toLobbyRoomState(runtimeStore.refreshPlayers(state.roomCode()), playerId);
        }

        return loadCasinoState(state.roomCode())
                .map(current -> toRoomState(state.version(), room, current))
                .orElse(state);
    }

    private GameLoopService.RoomState toLobbyRoomState(GameLoopService.RoomState base, String playerId) {
        Map<String, ObjectNode> privateStateByPlayer = new HashMap<>();
        ObjectNode privateState = objectMapper.createObjectNode();
        privateState.put("playerId", playerId);
        privateStateByPlayer.put(playerId, privateState);
        return new GameLoopService.RoomState(base.roomCode(), base.version(), base.publicState().deepCopy(), privateStateByPlayer);
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<Integer>> getCasinoValueMap(String roomCode) {
        return runtimeStore.getGameConfig(roomCode, CASINO_VALUE_MAP_KEY, Map.class)
                .map(m -> (Map<String, List<Integer>>) m)
                .orElse(null);
    }

    private Optional<CasinoState> loadCasinoState(String roomCode) {
        try {
            CasinoState state = runtimeStore.loadOrInitGameState(roomCode, CasinoState.class, () -> {
                throw new GameEngine.GameRuleException("Casino state missing");
            });
            return Optional.of(state);
        } catch (GameEngine.GameRuleException exception) {
            return Optional.empty();
        }
    }

    private GameLoopService.LoopResult handleStartGame(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        try {
            runtimeStore.markRoomInGame(command.roomCode(), command.playerId())
                    .orElseThrow(() -> new IllegalStateException("Room not found"));
        } catch (IllegalStateException exception) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }

        Optional<InMemoryRuntimeStore.RoomSnapshot> startedRoomOptional = runtimeStore.roomSnapshot(command.roomCode());
        if (startedRoomOptional.isEmpty()) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }
        InMemoryRuntimeStore.RoomSnapshot startedRoom = startedRoomOptional.get();

        try {
            List<String> participants = startedRoom.participantIds();
            Map<String, List<Integer>> rules = getCasinoValueMap(command.roomCode());
            if (rules == null) {
                rules = CasinoEngine.defaultValueMap();
            }
            String dealer = participants.size() > 1 ? participants.get(1) : "p2";
            CasinoState next = engine.init(command.roomCode(), List.copyOf(participants), dealer, rules);
            runtimeStore.saveGameState(command.roomCode(), next);

            GameLoopService.RoomState nextRoomState = toRoomState(state.version(), startedRoom, next);
            return GameLoopService.LoopResult.success(
                    nextRoomState,
                    nextRoomState.publicState(),
                    new HashMap<>(nextRoomState.privateStateByPlayer()),
                    engine.isFinished(next),
                    engine.getWinner(next)
            );
        } catch (GameEngine.GameRuleException exception) {
            runtimeStore.resetRoomToLobby(command.roomCode());
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }
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

    private GameLoopService.RoomState toRoomState(long version, InMemoryRuntimeStore.RoomSnapshot room, CasinoState gameState) {
        ObjectNode publicState = objectMapper.valueToTree(projector.toPublicView(gameState));
        publicState.put("roomCode", room.roomCode());
        publicState.put("version", version);
        publicState.put("hostPlayerId", room.hostPlayerId());
        publicState.put("selectedGame", room.selectedGame());
        publicState.put("status", room.status().name());
        publicState.put("isPrivate", room.isPrivate());

        Map<String, ObjectNode> privateStateByPlayer = new LinkedHashMap<>();
        for (String playerId : room.participantIds()) {
            privateStateByPlayer.put(playerId, objectMapper.valueToTree(projector.toPrivateView(gameState, playerId)));
        }

        return new GameLoopService.RoomState(room.roomCode(), version, publicState, privateStateByPlayer);
    }

    private static Map<String, List<Integer>> parseCasinoValueMap(JsonNode valueMapNode) {
        Map<String, List<Integer>> valueMap = new LinkedHashMap<>();
        if (valueMapNode == null || !valueMapNode.isObject()) {
            return valueMap;
        }
        valueMapNode.fields().forEachRemaining(entry -> {
            JsonNode valuesNode = entry.getValue();
            if (!valuesNode.isArray()) {
                return;
            }
            List<Integer> values = new ArrayList<>();
            valuesNode.forEach(value -> {
                if (value.isInt()) {
                    values.add(value.asInt());
                }
            });
            valueMap.put(entry.getKey(), values);
        });
        return valueMap;
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
        List<String> values = new ArrayList<>();
        node.forEach(item -> {
            if (item.isTextual()) {
                values.add(item.asText());
            }
        });
        return List.copyOf(values);
    }
}
