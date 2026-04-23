package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.games.fem.FemAction;
import dk.bodegadk.server.domain.games.fem.FemEngine;
import dk.bodegadk.server.domain.games.fem.FemState;
import dk.bodegadk.server.domain.games.fem.FemViewProjector;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
public class FemEnginePortAdapter implements GameLoopService.EnginePort {
    private static final String FEM_GAME_TYPE = "fem";
    private static final String START_GAME = "START_GAME";
    private static final String DRAW_FROM_STOCK = "DRAW_FROM_STOCK";
    private static final String DRAW_FROM_DISCARD = "DRAW_FROM_DISCARD";
    private static final String TAKE_DISCARD_PILE = "TAKE_DISCARD_PILE";
    private static final String LAY_MELD = "LAY_MELD";
    private static final String EXTEND_MELD = "EXTEND_MELD";
    private static final String SWAP_JOKER = "SWAP_JOKER";
    private static final String DISCARD = "DISCARD";
    private static final String CLAIM_DISCARD = "CLAIM_DISCARD";
    private static final String PASS_GRAB = "PASS_GRAB";

    private final InMemoryRuntimeStore runtimeStore;
    private final ObjectMapper objectMapper;
    private final FemEngine engine = new FemEngine();
    private final FemViewProjector projector = new FemViewProjector();

    public FemEnginePortAdapter(InMemoryRuntimeStore runtimeStore, ObjectMapper objectMapper) {
        this.runtimeStore = runtimeStore;
        this.objectMapper = objectMapper;
        runtimeStore.registerMaxPlayers(FEM_GAME_TYPE, 6);
    }

    @Override
    public boolean supports(String roomCode) {
        return runtimeStore.roomGameType(roomCode)
                .map(gt -> gt.trim().toLowerCase(Locale.ROOT))
                .filter(FEM_GAME_TYPE::equals)
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
            case DRAW_FROM_STOCK -> handleDrawFromStock(state, command, room);
            case DRAW_FROM_DISCARD -> handleDrawFromDiscard(state, command, room);
            case TAKE_DISCARD_PILE -> handleTakeDiscardPile(state, command, room);
            case LAY_MELD -> handleLayMeld(state, command, room);
            case EXTEND_MELD -> handleExtendMeld(state, command, room);
            case SWAP_JOKER -> handleSwapJoker(state, command, room);
            case DISCARD -> handleDiscard(state, command, room);
            case CLAIM_DISCARD -> handleClaimDiscard(state, command, room);
            case PASS_GRAB -> handlePassGrab(state, command, room);
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

        return loadFemState(state.roomCode())
                .map(current -> toFemRoomState(state, room, playerId, current))
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
            FemState next = engine.init(participants);
            runtimeStore.saveGameState(command.roomCode(), next);

            GameLoopService.RoomState nextRoomState = toFemRoomState(state, startedRoom, command.playerId(), next);
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

    /* ── DRAW_FROM_STOCK ── */

    private GameLoopService.LoopResult handleDrawFromStock(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        FemAction action = new FemAction.DrawFromStock(command.playerId());
        return applyGameAction(state, command, room, action);
    }

    /* ── DRAW_FROM_DISCARD ── */

    private GameLoopService.LoopResult handleDrawFromDiscard(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        FemAction action = new FemAction.DrawFromDiscard(command.playerId());
        return applyGameAction(state, command, room, action);
    }

    /* ── TAKE_DISCARD_PILE ── */

    private GameLoopService.LoopResult handleTakeDiscardPile(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        FemAction action = new FemAction.TakeDiscardPile(command.playerId());
        return applyGameAction(state, command, room, action);
    }

    /* ── LAY_MELD ── */

    private GameLoopService.LoopResult handleLayMeld(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        JsonNode payload = command.payloadRaw();
        List<String> cards = readStringList(payload.path("cards"));
        if (cards.isEmpty()) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        FemAction action = new FemAction.LayMeld(command.playerId(), cards);
        return applyGameAction(state, command, room, action);
    }

    /* ── EXTEND_MELD ── */

    private GameLoopService.LoopResult handleExtendMeld(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        JsonNode payload = command.payloadRaw();
        String meldId = readText(payload, "meldId");
        String card = readText(payload, "card");
        if (meldId == null || card == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        FemAction action = new FemAction.ExtendMeld(command.playerId(), meldId, card);
        return applyGameAction(state, command, room, action);
    }

    /* ── SWAP_JOKER ── */

    private GameLoopService.LoopResult handleSwapJoker(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        JsonNode payload = command.payloadRaw();
        String meldId = readText(payload, "meldId");
        String jokerCode = readText(payload, "jokerCode");
        String realCardCode = readText(payload, "realCardCode");
        if (meldId == null || jokerCode == null || realCardCode == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        FemAction action = new FemAction.SwapJoker(command.playerId(), meldId, jokerCode, realCardCode);
        return applyGameAction(state, command, room, action);
    }

    /* ── DISCARD ── */

    private GameLoopService.LoopResult handleDiscard(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        JsonNode payload = command.payloadRaw();
        String card = readText(payload, "card");
        if (card == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        FemAction action = new FemAction.Discard(command.playerId(), card);
        return applyGameAction(state, command, room, action);
    }

    /* ── CLAIM_DISCARD ── */

    private GameLoopService.LoopResult handleClaimDiscard(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        JsonNode payload = command.payloadRaw();
        String meldId = readText(payload, "meldId");
        if (meldId == null) {
            return GameLoopService.LoopResult.error("BAD_MESSAGE: invalid envelope or type");
        }

        FemAction action = new FemAction.ClaimDiscard(command.playerId(), meldId);
        return applyGameAction(state, command, room, action);
    }

    /* ── PASS_GRAB ── */

    private GameLoopService.LoopResult handlePassGrab(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room
    ) {
        if (room.status() != InMemoryRuntimeStore.RoomStatus.IN_GAME) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: game has not started");
        }

        FemAction action = new FemAction.PassGrab(command.playerId());
        return applyGameAction(state, command, room, action);
    }

    /* ── Shared apply logic ── */

    private GameLoopService.LoopResult applyGameAction(
            GameLoopService.RoomState state,
            GameLoopService.ActionCommand command,
            InMemoryRuntimeStore.RoomSnapshot room,
            FemAction action
    ) {
        FemState current = loadFemState(command.roomCode())
                .orElseThrow(() -> new GameEngine.GameRuleException("Fem state missing"));

        FemState next;
        try {
            next = engine.apply(action, current);
        } catch (GameEngine.GameRuleException exception) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }

        runtimeStore.saveGameState(command.roomCode(), next);
        GameLoopService.RoomState nextRoomState = toFemRoomState(state, room, command.playerId(), next);

        return GameLoopService.LoopResult.success(
                nextRoomState,
                nextRoomState.publicState(),
                privateUpdatesForAllPlayers(nextRoomState, room.participantIds()),
                engine.isFinished(next),
                engine.getWinner(next)
        );
    }

    /* ── State helpers ── */

    private Optional<FemState> loadFemState(String roomCode) {
        try {
            FemState state = runtimeStore.loadOrInitGameState(roomCode, FemState.class, () -> {
                throw new GameEngine.GameRuleException("Fem state missing");
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

    private GameLoopService.RoomState toFemRoomState(
            GameLoopService.RoomState base,
            InMemoryRuntimeStore.RoomSnapshot room,
            String actorPlayerId,
            FemState gameState
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
