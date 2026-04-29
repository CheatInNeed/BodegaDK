package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class GameLoopService {
    private final InMemoryRuntimeStore runtimeStore;
    private final LobbyCoordinator lobbyCoordinator;
    private final List<EnginePort> enginePorts;

    @Autowired
    public GameLoopService(
            InMemoryRuntimeStore runtimeStore,
            LobbyCoordinator lobbyCoordinator,
            @Autowired(required = false) List<EnginePort> enginePorts
    ) {
        this.runtimeStore = runtimeStore;
        this.lobbyCoordinator = lobbyCoordinator;
        this.enginePorts = enginePorts == null ? List.of() : List.copyOf(enginePorts);
    }

    public GameLoopService(InMemoryRuntimeStore runtimeStore, @Autowired(required = false) List<EnginePort> enginePorts) {
        this(runtimeStore, new LobbyCoordinator(runtimeStore, new GameCatalogService(), new InMemoryRoomMetadataStore()), enginePorts);
    }

    public LoopResult handleAction(ActionCommand command) {
        if (lobbyCoordinator.supports(command)) {
            return persistLoopResult(command, runtimeStore.loadState(command.roomCode()), lobbyCoordinator.handle(command));
        }

        EnginePort enginePort = resolveEngine(command.roomCode());
        if (enginePort == null) {
            return LoopResult.error("ENGINE_NOT_READY: no engine available for room/game type");
        }

        RoomState currentState = runtimeStore.loadState(command.roomCode());
        LoopResult result = enginePort.apply(currentState, command);
        return persistLoopResult(command, currentState, result);
    }

    private LoopResult persistLoopResult(ActionCommand command, RoomState currentState, LoopResult result) {

        if (result == null) {
            return LoopResult.error("RULES_NOT_AVAILABLE: engine returned no result");
        }
        if (result.isError()) {
            return result;
        }

        RoomState nextState = result.nextState() == null ? currentState : result.nextState();
        long nextVersion = currentState.version() + 1;
        ObjectNode publicState = nextState.publicState().deepCopy();
        publicState.put("version", nextVersion);

        RoomState persisted = new RoomState(
                nextState.roomCode(),
                nextVersion,
                publicState,
                copyPrivateState(nextState.privateStateByPlayer())
        );
        runtimeStore.saveState(command.roomCode(), persisted);

        return result.withNextState(persisted);
    }

    public RoomState prepareSnapshot(String roomCode, String playerId) {
        RoomState refreshed = runtimeStore.refreshPlayers(roomCode);
        EnginePort enginePort = resolveEngine(roomCode);
        if (enginePort == null) {
            return refreshed;
        }

        RoomState prepared = enginePort.prepareSnapshot(refreshed, playerId);
        if (prepared == null) {
            return refreshed;
        }

        runtimeStore.saveState(roomCode, prepared);
        return prepared;
    }

    public Optional<String> handleConnect(String roomCode, JsonNode connectPayload) {
        EnginePort port = resolveEngine(roomCode);
        if (port == null) {
            return Optional.empty();
        }
        return port.onConnect(roomCode, connectPayload);
    }

    private EnginePort resolveEngine(String roomCode) {
        return enginePorts.stream()
                .filter(enginePort -> enginePort.supports(roomCode))
                .findFirst()
                .orElse(null);
    }

    private Map<String, ObjectNode> copyPrivateState(Map<String, ObjectNode> original) {
        Map<String, ObjectNode> copy = new HashMap<>();
        for (Map.Entry<String, ObjectNode> entry : original.entrySet()) {
            copy.put(entry.getKey(), entry.getValue() == null ? null : entry.getValue().deepCopy());
        }
        return copy;
    }

    public interface EnginePort {
        boolean supports(String roomCode);

        LoopResult apply(RoomState state, ActionCommand command);

        default RoomState prepareSnapshot(RoomState state, String playerId) {
            return state;
        }

        default Optional<String> onConnect(String roomCode, JsonNode connectPayload) {
            return Optional.empty();
        }
    }

    public record ActionCommand(
            String roomCode,
            String playerId,
            String type,
            JsonNode payloadRaw,
            String requestId,
            Instant receivedAt
    ) {
    }

    public record RoomState(
            String roomCode,
            long version,
            ObjectNode publicState,
            Map<String, ObjectNode> privateStateByPlayer
    ) {
        public RoomState {
            privateStateByPlayer = privateStateByPlayer == null
                    ? Collections.emptyMap()
                    : Collections.unmodifiableMap(new HashMap<>(privateStateByPlayer));
        }

        public JsonNode privateStateFor(String playerId) {
            ObjectNode privateNode = privateStateByPlayer.get(playerId);
            return privateNode == null ? null : privateNode.deepCopy();
        }

        public RoomState withPublicState(ObjectNode nextPublicState) {
            return new RoomState(roomCode, version, nextPublicState, privateStateByPlayer);
        }
    }

    public record LoopResult(
            JsonNode publicUpdate,
            Map<String, JsonNode> privateUpdates,
            RoomState nextState,
            boolean finished,
            String winnerPlayerId,
            String errorMessage
    ) {
        public LoopResult {
            privateUpdates = privateUpdates == null
                    ? Collections.emptyMap()
                    : Collections.unmodifiableMap(new HashMap<>(privateUpdates));
        }

        public static LoopResult error(String message) {
            return new LoopResult(null, Collections.emptyMap(), null, false, null, message);
        }

        public static LoopResult success(
                RoomState nextState,
                JsonNode publicUpdate,
                Map<String, JsonNode> privateUpdates,
                boolean finished,
                String winnerPlayerId
        ) {
            return new LoopResult(publicUpdate, privateUpdates, nextState, finished, winnerPlayerId, null);
        }

        public boolean isError() {
            return errorMessage != null;
        }

        public LoopResult withNextState(RoomState state) {
            return new LoopResult(publicUpdate, privateUpdates, state, finished, winnerPlayerId, errorMessage);
        }
    }
}
