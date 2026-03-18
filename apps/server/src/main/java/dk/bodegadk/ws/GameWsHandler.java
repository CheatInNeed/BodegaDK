package dk.bodegadk.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.runtime.GameLoopService;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.server.domain.games.casino.CasinoEngine;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class GameWsHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final InMemoryRuntimeStore runtimeStore;
    private final GameLoopService gameLoopService;

    private final ConcurrentMap<String, WebSocketSession> sessionsById = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ConnectionBinding> bindingsById = new ConcurrentHashMap<>();

    public GameWsHandler(ObjectMapper objectMapper, InMemoryRuntimeStore runtimeStore, GameLoopService gameLoopService) {
        this.objectMapper = objectMapper;
        this.runtimeStore = runtimeStore;
        this.gameLoopService = gameLoopService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessionsById.put(session.getId(), session);
        bindingsById.put(session.getId(), ConnectionBinding.pending());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        ConnectionBinding binding = bindingsById.getOrDefault(session.getId(), ConnectionBinding.pending());
        InboundMessage inbound = parseInbound(message.getPayload());
        if (inbound == null || inbound.type == null || inbound.type.isBlank()) {
            sendError(session, "BAD_MESSAGE: invalid envelope or type");
            if (!binding.connected) {
                closeQuietly(session);
            }
            return;
        }

        if (!binding.connected && !"CONNECT".equals(inbound.type)) {
            sendError(session, "BAD_MESSAGE: CONNECT must be the first message");
            closeQuietly(session);
            return;
        }

        if (binding.connected && "CONNECT".equals(inbound.type)) {
            sendError(session, "BAD_MESSAGE: invalid envelope or type");
            return;
        }

        if ("CONNECT".equals(inbound.type)) {
            handleConnect(session, inbound);
            return;
        }

        dispatchAction(session, binding, inbound);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        removeSession(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        closeQuietly(session);
    }

    private void handleConnect(WebSocketSession session, InboundMessage inbound) {
        String roomCode = inbound.payload.path("roomCode").asText("");
        String token = inbound.payload.path("token").asText("");
        String requestedGame = inbound.payload.path("game").asText("");

        if (roomCode.isBlank() || token.isBlank()) {
            sendError(session, "BAD_MESSAGE: invalid envelope or type");
            closeQuietly(session);
            return;
        }

        Optional<String> roomGameType = runtimeStore.roomGameType(roomCode);
        if (roomGameType.isEmpty()) {
            sendError(session, "SESSION_NOT_READY: session validation unavailable");
            closeQuietly(session);
            return;
        }
        if (!requestedGame.isBlank() && !roomGameType.get().equalsIgnoreCase(requestedGame)) {
            sendError(session, "BAD_MESSAGE: invalid envelope or type");
            closeQuietly(session);
            return;
        }
        if ("casino".equalsIgnoreCase(roomGameType.get())) {
            Map<String, java.util.List<Integer>> valueMap = parseCasinoValueMap(inbound.payload.path("setup").path("casinoRules").path("valueMap"));
            String validationError = CasinoEngine.validateValueMap(valueMap);
            if (validationError != null) {
                sendError(session, validationError);
                closeQuietly(session);
                return;
            }
            runtimeStore.saveCasinoValueMap(roomCode, valueMap);
        }

        Optional<InMemoryRuntimeStore.PlayerSession> resolved = runtimeStore.resolveConnect(roomCode, token);
        if (resolved.isEmpty()) {
            sendError(session, "SESSION_NOT_READY: session validation unavailable");
            closeQuietly(session);
            return;
        }

        InMemoryRuntimeStore.PlayerSession playerSession = resolved.get();
        bindingsById.put(session.getId(), ConnectionBinding.connected(roomCode, playerSession.playerId()));

        GameLoopService.RoomState state = gameLoopService.prepareSnapshot(roomCode, playerSession.playerId());
        ObjectNode payload = objectMapper.createObjectNode();

        // TEAM-UI-INTEGRATION: these snapshot fields are the server contract consumed by game-board UI.
        payload.set("publicState", state.publicState());
        JsonNode privateState = state.privateStateFor(playerSession.playerId());
        payload.set("privateState", privateState == null ? objectMapper.createObjectNode() : privateState);

        sendEnvelope(session, "STATE_SNAPSHOT", payload);

        if (state.publicState().path("started").asBoolean(false)) {
            broadcastToRoom(roomCode, "PUBLIC_UPDATE", state.publicState());
            for (Map.Entry<String, ObjectNode> entry : state.privateStateByPlayer().entrySet()) {
                sendToPlayer(roomCode, entry.getKey(), "PRIVATE_UPDATE", entry.getValue());
            }
        }
    }

    private void dispatchAction(WebSocketSession actorSession, ConnectionBinding binding, InboundMessage inbound) {
        GameLoopService.ActionCommand command = new GameLoopService.ActionCommand(
                binding.roomCode,
                binding.playerId,
                inbound.type,
                inbound.payload,
                UUID.randomUUID().toString(),
                Instant.now()
        );

        runtimeStore.submit(binding.roomCode, () -> {
            GameLoopService.LoopResult result = gameLoopService.handleAction(command);
            publishResult(actorSession.getId(), binding.roomCode, result);
        });
    }

    private void publishResult(String actorSessionId, String roomCode, GameLoopService.LoopResult result) {
        WebSocketSession actor = sessionsById.get(actorSessionId);

        if (result == null) {
            sendError(actor, "RULES_NOT_AVAILABLE: engine returned no result");
            return;
        }
        if (result.isError()) {
            sendError(actor, result.errorMessage());
            return;
        }

        if (result.publicUpdate() != null) {
            broadcastToRoom(roomCode, "PUBLIC_UPDATE", result.publicUpdate());
        }

        if (!result.privateUpdates().isEmpty()) {
            for (Map.Entry<String, JsonNode> entry : result.privateUpdates().entrySet()) {
                // TEAM-UI-INTEGRATION: private updates are targeted to player-specific views.
                sendToPlayer(roomCode, entry.getKey(), "PRIVATE_UPDATE", entry.getValue());
            }
        }

        if (result.finished()) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("winnerPlayerId", result.winnerPlayerId());
            broadcastToRoom(roomCode, "GAME_FINISHED", payload);
        }
    }

    private void broadcastToRoom(String roomCode, String type, JsonNode payload) {
        for (Map.Entry<String, ConnectionBinding> entry : bindingsById.entrySet()) {
            ConnectionBinding binding = entry.getValue();
            if (!binding.connected || !roomCode.equals(binding.roomCode)) {
                continue;
            }
            WebSocketSession session = sessionsById.get(entry.getKey());
            if (session != null) {
                sendEnvelope(session, type, payload);
            }
        }
    }

    private void sendToPlayer(String roomCode, String playerId, String type, JsonNode payload) {
        for (Map.Entry<String, ConnectionBinding> entry : bindingsById.entrySet()) {
            ConnectionBinding binding = entry.getValue();
            if (!binding.connected || !roomCode.equals(binding.roomCode) || !playerId.equals(binding.playerId)) {
                continue;
            }
            WebSocketSession session = sessionsById.get(entry.getKey());
            if (session != null) {
                sendEnvelope(session, type, payload);
            }
        }
    }

    private InboundMessage parseInbound(String raw) {
        try {
            JsonNode root = objectMapper.readTree(raw);
            String type = root.path("type").asText(null);
            JsonNode payload = root.path("payload");
            if (!payload.isObject()) {
                payload = objectMapper.createObjectNode();
            }
            return new InboundMessage(type, payload);
        } catch (IOException ex) {
            return null;
        }
    }

    private void sendError(WebSocketSession session, String message) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("message", message);
        sendEnvelope(session, "ERROR", payload);
    }

    private void sendEnvelope(WebSocketSession session, String type, JsonNode payload) {
        if (session == null || !session.isOpen()) {
            return;
        }

        ObjectNode envelope = objectMapper.createObjectNode();
        envelope.put("type", type);
        envelope.set("payload", payload == null ? objectMapper.createObjectNode() : payload);

        synchronized (session) {
            if (!session.isOpen()) {
                return;
            }
            try {
                session.sendMessage(new TextMessage(envelope.toString()));
            } catch (IOException ignored) {
                closeQuietly(session);
            }
        }
    }

    private void closeQuietly(WebSocketSession session) {
        if (session == null) {
            return;
        }
        try {
            session.close();
        } catch (IOException ignored) {
            // ignored
        } finally {
            removeSession(session.getId());
        }
    }

    private void removeSession(String sessionId) {
        sessionsById.remove(sessionId);
        bindingsById.remove(sessionId);
    }

    private record InboundMessage(String type, JsonNode payload) {
    }

    private Map<String, java.util.List<Integer>> parseCasinoValueMap(JsonNode valueMapNode) {
        Map<String, java.util.List<Integer>> valueMap = new java.util.LinkedHashMap<>();
        if (valueMapNode == null || !valueMapNode.isObject()) {
            return valueMap;
        }
        valueMapNode.fields().forEachRemaining(entry -> {
            JsonNode valuesNode = entry.getValue();
            if (!valuesNode.isArray()) {
                return;
            }
            java.util.List<Integer> values = new java.util.ArrayList<>();
            valuesNode.forEach(value -> {
                if (value.isInt()) {
                    values.add(value.asInt());
                }
            });
            valueMap.put(entry.getKey(), values);
        });
        return valueMap;
    }

    private record ConnectionBinding(String roomCode, String playerId, boolean connected) {
        static ConnectionBinding pending() {
            return new ConnectionBinding(null, null, false);
        }

        static ConnectionBinding connected(String roomCode, String playerId) {
            return new ConnectionBinding(roomCode, playerId, true);
        }
    }
}
