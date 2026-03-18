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
import dk.bodegadk.server.domain.games.krig.KrigAction;
import dk.bodegadk.server.domain.games.krig.KrigEngine;
import dk.bodegadk.server.domain.games.krig.KrigState;
import dk.bodegadk.server.domain.games.krig.KrigViewProjector;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
public class HighCardEnginePortAdapter implements GameLoopService.EnginePort {
    private static final String HIGHCARD_GAME_TYPE = "highcard";
    private static final String KRIG_GAME_TYPE = "krig";
    private static final String PLAY_CARDS = "PLAY_CARDS";
    private static final String SELECT_GAME = "SELECT_GAME";
    private static final String START_GAME = "START_GAME";

    private final InMemoryRuntimeStore runtimeStore;
    private final ObjectMapper objectMapper;

    private final HighCardEngine highCardEngine = new HighCardEngine();
    private final HighCardViewProjector highCardProjector = new HighCardViewProjector();
    private final KrigEngine krigEngine = new KrigEngine();
    private final KrigViewProjector krigProjector = new KrigViewProjector();

    public HighCardEnginePortAdapter(InMemoryRuntimeStore runtimeStore, ObjectMapper objectMapper) {
        this.runtimeStore = runtimeStore;
        this.objectMapper = objectMapper;
    }

    @Override
    public GameLoopService.LoopResult apply(GameLoopService.RoomState state, GameLoopService.ActionCommand command) {
        if (!runtimeStore.isParticipant(command.roomCode(), command.playerId())) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }

        Optional<InMemoryRuntimeStore.RoomSnapshot> roomOptional = runtimeStore.roomSnapshot(command.roomCode());
        if (roomOptional.isEmpty()) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }

        InMemoryRuntimeStore.RoomSnapshot room = roomOptional.get();
        return switch (command.type()) {
            case SELECT_GAME -> handleSelectGame(state, command, room);
            case START_GAME -> handleStartGame(state, command, room);
            case PLAY_CARDS -> handlePlayCards(state, command, room);
            default -> GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        };
    }

    @Override
    public GameLoopService.RoomState prepareSnapshot(GameLoopService.RoomState state, String playerId) {
        Optional<InMemoryRuntimeStore.RoomSnapshot> roomOptional = runtimeStore.roomSnapshot(state.roomCode());
        if (roomOptional.isEmpty()) {
            return state;
        }

        InMemoryRuntimeStore.RoomSnapshot room = roomOptional.get();
        if (room.status() == InMemoryRuntimeStore.RoomStatus.LOBBY) {
            return toLobbyRoomState(runtimeStore.refreshPlayers(state.roomCode()), playerId);
        }

        return switch (normalizedGame(room.selectedGame())) {
            case HIGHCARD_GAME_TYPE -> {
                HighCardState current = runtimeStore.loadOrCreateHighCardState(
                        state.roomCode(),
                        () -> highCardEngine.init(room.participants())
                );
                yield toHighCardRoomState(state, room, playerId, current);
            }
            case KRIG_GAME_TYPE -> {
                KrigState current = runtimeStore.loadOrCreateKrigState(
                        state.roomCode(),
                        () -> krigEngine.init(room.participants())
                );
                yield toKrigRoomState(state, room, playerId, current);
            }
            default -> runtimeStore.refreshPlayers(state.roomCode());
        };
    }

    private GameLoopService.RoomState toLobbyRoomState(GameLoopService.RoomState state, String playerId) {
        Map<String, ObjectNode> privateStateByPlayer = new HashMap<>();
        ObjectNode privateState = objectMapper.createObjectNode();
        privateState.put("playerId", playerId);
        privateStateByPlayer.put(playerId, privateState);
        return new GameLoopService.RoomState(
                state.roomCode(),
                state.version(),
                state.publicState().deepCopy(),
                privateStateByPlayer
        );
    }

    private GameLoopService.LoopResult handleSelectGame(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        String requestedGame = normalizedGame(command.payloadRaw().path("game").asText(""));
        if (!isSupportedGame(requestedGame)) {
            return GameLoopService.LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        }

        try {
            runtimeStore.selectGame(command.roomCode(), command.playerId(), requestedGame)
                    .orElseThrow(() -> new IllegalStateException("Room not found"));
        } catch (IllegalStateException exception) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }

        GameLoopService.RoomState nextState = runtimeStore.refreshPlayers(command.roomCode());
        return GameLoopService.LoopResult.success(nextState, nextState.publicState(), Map.of(), false, null);
    }

    private GameLoopService.LoopResult handleStartGame(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        String selectedGame = normalizedGame(room.selectedGame());
        if (!isSupportedGame(selectedGame)) {
            return GameLoopService.LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        }

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
            GameLoopService.RoomState nextState = switch (selectedGame) {
                case HIGHCARD_GAME_TYPE -> {
                    HighCardState highCardState = highCardEngine.init(startedRoom.participants());
                    runtimeStore.saveHighCardState(command.roomCode(), highCardState);
                    yield toHighCardRoomState(state, startedRoom, command.playerId(), highCardState);
                }
                case KRIG_GAME_TYPE -> {
                    KrigState krigState = krigEngine.init(startedRoom.participants());
                    runtimeStore.saveKrigState(command.roomCode(), krigState);
                    yield toKrigRoomState(state, startedRoom, command.playerId(), krigState);
                }
                default -> throw new IllegalStateException("Unsupported game type");
            };
            return GameLoopService.LoopResult.success(nextState, nextState.publicState(), privateUpdatesForAllPlayers(nextState, startedRoom.participants()), false, null);
        } catch (GameEngine.GameRuleException ruleException) {
            runtimeStore.resetRoomToLobby(command.roomCode());
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + ruleException.getMessage());
        }
    }

    private GameLoopService.LoopResult handlePlayCards(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        String selectedGame = normalizedGame(room.selectedGame());
        if (!isSupportedGame(selectedGame)) {
            return GameLoopService.LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        }
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        return switch (selectedGame) {
            case HIGHCARD_GAME_TYPE -> applyHighCard(state, command, room);
            case KRIG_GAME_TYPE -> applyKrig(state, command, room);
            default -> GameLoopService.LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        };
    }

    private GameLoopService.LoopResult applyHighCard(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (!PLAY_CARDS.equals(command.type())) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        String cardCode = parseSingleCard(command.payloadRaw());
        if (cardCode == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        HighCardState current = runtimeStore.loadOrCreateHighCardState(
                command.roomCode(),
                () -> highCardEngine.init(room.participants())
        );
        if (!isAllowedActor(current, command.playerId())) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: highcard supports exactly one active player");
        }

        HighCardState next;
        try {
            next = highCardEngine.apply(new HighCardAction(command.playerId(), cardCode), current);
        } catch (GameEngine.GameRuleException ruleException) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + ruleException.getMessage());
        }

        runtimeStore.saveHighCardState(command.roomCode(), next);
        GameLoopService.RoomState nextRoomState = toHighCardRoomState(state, room, command.playerId(), next);

        Map<String, JsonNode> privateUpdates = new HashMap<>();
        JsonNode privateForPlayer = nextRoomState.privateStateFor(command.playerId());
        if (privateForPlayer != null) {
            privateUpdates.put(command.playerId(), privateForPlayer);
        }

        return GameLoopService.LoopResult.success(
                nextRoomState,
                nextRoomState.publicState(),
                privateUpdates,
                highCardEngine.isFinished(next),
                highCardEngine.getWinner(next)
        );
    }

    private GameLoopService.LoopResult applyKrig(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        String cardCode = parseSingleCard(command.payloadRaw());
        if (cardCode == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        KrigState current = runtimeStore.loadOrCreateKrigState(
                command.roomCode(),
                () -> krigEngine.init(room.participants())
        );

        KrigState next;
        try {
            next = krigEngine.apply(new KrigAction(command.playerId(), cardCode), current);
        } catch (GameEngine.GameRuleException ruleException) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + ruleException.getMessage());
        }

        runtimeStore.saveKrigState(command.roomCode(), next);
        GameLoopService.RoomState nextRoomState = toKrigRoomState(state, room, command.playerId(), next);

        Map<String, JsonNode> privateUpdates = new HashMap<>();
        for (String playerId : room.participants()) {
            JsonNode privateState = nextRoomState.privateStateFor(playerId);
            if (privateState != null) {
                privateUpdates.put(playerId, privateState);
            }
        }

        return GameLoopService.LoopResult.success(
                nextRoomState,
                nextRoomState.publicState(),
                privateUpdates,
                krigEngine.isFinished(next),
                krigEngine.getWinner(next)
        );
    }

    private GameLoopService.RoomState toHighCardRoomState(
            GameLoopService.RoomState base,
            InMemoryRuntimeStore.RoomSnapshot room,
            String playerId,
            HighCardState gameState
    ) {
        ObjectNode publicState = objectMapper.valueToTree(highCardProjector.toPublicView(gameState));
        enrichPublicState(publicState, base.version(), room);

        ObjectNode privateState = objectMapper.valueToTree(highCardProjector.toPrivateView(gameState, playerId));
        Map<String, ObjectNode> privateStateByPlayer = new HashMap<>();
        privateStateByPlayer.put(playerId, privateState);

        return new GameLoopService.RoomState(room.roomCode(), base.version(), publicState, privateStateByPlayer);
    }

    private GameLoopService.RoomState toKrigRoomState(
            GameLoopService.RoomState base,
            InMemoryRuntimeStore.RoomSnapshot room,
            String actorPlayerId,
            KrigState gameState
    ) {
        ObjectNode publicState = objectMapper.valueToTree(krigProjector.toPublicView(gameState));
        enrichPublicState(publicState, base.version(), room);

        Map<String, ObjectNode> privateStateByPlayer = new HashMap<>();
        for (String playerId : room.participants()) {
            ObjectNode privateState = objectMapper.valueToTree(krigProjector.toPrivateView(gameState, playerId));
            privateStateByPlayer.put(playerId, privateState);
        }

        if (!privateStateByPlayer.containsKey(actorPlayerId)) {
            privateStateByPlayer.put(actorPlayerId, objectMapper.createObjectNode());
        }

        return new GameLoopService.RoomState(room.roomCode(), base.version(), publicState, privateStateByPlayer);
    }

    private void enrichPublicState(ObjectNode publicState, long version, InMemoryRuntimeStore.RoomSnapshot room) {
        publicState.put("roomCode", room.roomCode());
        publicState.put("version", version);
        publicState.put("hostPlayerId", room.hostPlayerId());
        publicState.put("selectedGame", room.selectedGame());
        publicState.put("status", room.status().name());
        publicState.put("isPrivate", room.isPrivate());

        ArrayNode players = objectMapper.createArrayNode();
        room.participants().forEach(players::add);
        publicState.set("players", players);
    }

    private Map<String, JsonNode> privateUpdatesForAllPlayers(GameLoopService.RoomState state, List<String> playerIds) {
        Map<String, JsonNode> updates = new HashMap<>();
        for (String playerId : playerIds) {
            JsonNode privateState = state.privateStateFor(playerId);
            if (privateState != null) {
                updates.put(playerId, privateState);
            }
        }
        return updates;
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

    private boolean isSupportedGame(String gameType) {
        return HIGHCARD_GAME_TYPE.equals(gameType) || KRIG_GAME_TYPE.equals(gameType);
    }

    private String normalizedGame(String gameType) {
        return gameType == null ? "" : gameType.trim().toLowerCase(Locale.ROOT);
    }
}
