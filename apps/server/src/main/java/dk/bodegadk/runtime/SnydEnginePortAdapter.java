package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.games.snyd.SnydAction;
import dk.bodegadk.server.domain.games.snyd.SnydEngine;
import dk.bodegadk.server.domain.games.snyd.SnydState;
import dk.bodegadk.server.domain.games.snyd.SnydViewProjector;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
public class SnydEnginePortAdapter implements GameLoopService.EnginePort {
    private static final String SNYD_GAME_TYPE = "snyd";
    private static final String START_GAME = "START_GAME";
    private static final String PLAY_CARDS = "PLAY_CARDS";
    private static final String CALL_SNYD = "CALL_SNYD";

    private final InMemoryRuntimeStore runtimeStore;
    private final ObjectMapper objectMapper;
    private final SnydEngine engine = new SnydEngine();
    private final SnydViewProjector projector = new SnydViewProjector();

    public SnydEnginePortAdapter(InMemoryRuntimeStore runtimeStore, ObjectMapper objectMapper) {
        this.runtimeStore = runtimeStore;
        this.objectMapper = objectMapper;
        runtimeStore.registerMaxPlayers(SNYD_GAME_TYPE, 6);
    }

    @Override
    public boolean supports(String roomCode) {
        return runtimeStore.roomGameType(roomCode)
                .map(gt -> gt.trim().toLowerCase(Locale.ROOT))
                .filter(SNYD_GAME_TYPE::equals)
                .isPresent();
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

        return switch (command.type()) {
            case START_GAME -> handleStartGame(state, command, room);
            case PLAY_CARDS -> handlePlayCards(state, command, room);
            case CALL_SNYD -> handleCallSnyd(state, command, room);
            default -> GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        };
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

        return loadSnydState(state.roomCode())
                .map(current -> toSnydRoomState(state, room, playerId, current))
                .orElse(state);
    }

    /* ── START_GAME ── */

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
            SnydState next = engine.init(participants);
            runtimeStore.saveGameState(command.roomCode(), next);

            GameLoopService.RoomState nextRoomState = toSnydRoomState(state, startedRoom, command.playerId(), next);
            return GameLoopService.LoopResult.success(
                    nextRoomState,
                    nextRoomState.publicState(),
                    privateUpdatesForAllPlayers(nextRoomState, participants),
                    engine.isFinished(next),
                    engine.getWinner(next)
            );
        } catch (GameEngine.GameRuleException exception) {
            runtimeStore.resetRoomToLobby(command.roomCode());
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }
    }

    /* ── PLAY_CARDS ── */

    private GameLoopService.LoopResult handlePlayCards(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        JsonNode payload = command.payloadRaw();
        List<String> cards = readStringList(payload.path("cards"));
        String claimRank = readText(payload, "claimRank");
        if (cards.isEmpty() || claimRank == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        SnydAction action = new SnydAction.PlayCards(command.playerId(), cards, claimRank);
        return applyGameAction(state, command, room, action);
    }

    /* ── CALL_SNYD ── */

    private GameLoopService.LoopResult handleCallSnyd(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        SnydAction action = new SnydAction.CallSnyd(command.playerId());
        return applyGameAction(state, command, room, action);
    }

    /* ── Shared apply logic ── */

    private GameLoopService.LoopResult applyGameAction(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room,
            SnydAction action
    ) {
        SnydState current = loadSnydState(command.roomCode())
                .orElseThrow(() -> new GameEngine.GameRuleException("Snyd state missing"));

        SnydState next;
        try {
            next = engine.apply(action, current);
        } catch (GameEngine.GameRuleException exception) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }

        runtimeStore.saveGameState(command.roomCode(), next);
        GameLoopService.RoomState nextRoomState = toSnydRoomState(state, room, command.playerId(), next);

        return GameLoopService.LoopResult.success(
                nextRoomState,
                nextRoomState.publicState(),
                privateUpdatesForAllPlayers(nextRoomState, room.participantIds()),
                engine.isFinished(next),
                engine.getWinner(next)
        );
    }

    /* ── State helpers ── */

    private Optional<SnydState> loadSnydState(String roomCode) {
        try {
            SnydState state = runtimeStore.loadOrInitGameState(roomCode, SnydState.class, () -> {
                throw new GameEngine.GameRuleException("Snyd state missing");
            });
            return Optional.of(state);
        } catch (GameEngine.GameRuleException exception) {
            return Optional.empty();
        }
    }

    private GameLoopService.RoomState toLobbyRoomState(GameLoopService.RoomState base, String playerId) {
        Map<String, ObjectNode> privateStateByPlayer = new HashMap<>();
        ObjectNode privateState = objectMapper.createObjectNode();
        privateState.put("playerId", playerId);
        privateStateByPlayer.put(playerId, privateState);
        return new GameLoopService.RoomState(base.roomCode(), base.version(), base.publicState().deepCopy(), privateStateByPlayer);
    }

    private GameLoopService.RoomState toSnydRoomState(
            GameLoopService.RoomState base,
            InMemoryRuntimeStore.RoomSnapshot room,
            String actorPlayerId,
            SnydState gameState
    ) {
        ObjectNode publicState = objectMapper.valueToTree(projector.toPublicView(gameState));
        enrichPublicState(publicState, base.version(), room);

        Map<String, ObjectNode> privateStateByPlayer = new LinkedHashMap<>();
        for (String playerId : room.participantIds()) {
            ObjectNode privateState = objectMapper.valueToTree(projector.toPrivateView(gameState, playerId));
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
        room.participants().forEach(player -> {
            ObjectNode playerPayload = objectMapper.createObjectNode();
            playerPayload.put("playerId", player.playerId());
            if (player.username() == null) {
                playerPayload.putNull("username");
            } else {
                playerPayload.put("username", player.username());
            }
            players.add(playerPayload);
        });
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

    private String normalizeGame(String gameType) {
        return gameType == null ? "" : gameType.trim().toLowerCase(Locale.ROOT);
    }

    private String readText(JsonNode payload, String field) {
        JsonNode node = payload == null ? null : payload.get(field);
        return node != null && node.isTextual() ? node.asText() : null;
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
