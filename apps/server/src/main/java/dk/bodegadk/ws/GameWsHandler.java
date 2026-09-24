package dk.bodegadk.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.runtime.GameLoopService;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.runtime.MatchmakingService;
import dk.bodegadk.runtime.MatchHistoryStore;
import dk.bodegadk.runtime.RoomMetadataStore;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class GameWsHandler extends TextWebSocketHandler {
    private static final Duration HEARTBEAT_TIMEOUT = Duration.ofSeconds(20);

    private final ObjectMapper objectMapper;
    private final InMemoryRuntimeStore runtimeStore;
    private final GameLoopService gameLoopService;
    private final RoomMetadataStore roomMetadataStore;
    private final MatchHistoryStore matchHistoryStore;
    private final JwtDecoder jwtDecoder;

    private final ConcurrentMap<String, WebSocketSession> sessionsById = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ConnectionBinding> bindingsById = new ConcurrentHashMap<>();

    public GameWsHandler(ObjectMapper objectMapper, InMemoryRuntimeStore runtimeStore, GameLoopService gameLoopService, RoomMetadataStore roomMetadataStore, MatchHistoryStore matchHistoryStore, JwtDecoder jwtDecoder) {
        this.objectMapper = objectMapper;
        this.runtimeStore = runtimeStore;
        this.gameLoopService = gameLoopService;
        this.roomMetadataStore = roomMetadataStore;
        this.matchHistoryStore = matchHistoryStore;
        this.jwtDecoder = jwtDecoder;
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

        if ("HEARTBEAT".equals(inbound.type)) {
            handleHeartbeat(session, binding);
            return;
        }

        dispatchAction(session, binding, inbound);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        removeSession(session.getId(), true);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        closeQuietly(session);
    }

    @Scheduled(fixedDelay = 5000)
    public void sweepStaleConnections() {
        for (InMemoryRuntimeStore.ExpiredSession expired : runtimeStore.sweepExpiredSessions(HEARTBEAT_TIMEOUT)) {
            closeSessionByToken(expired.token(), "HEARTBEAT_TIMEOUT");
            publishRoomMutation(expired.mutation());
        }
    }

    public void publishLobbyState(String roomCode) {
        runtimeStore.roomSnapshot(roomCode).ifPresentOrElse(
                room -> broadcastToRoom(roomCode, "PUBLIC_UPDATE", lobbyPayload(room)),
                () -> broadcastToRoom(roomCode, "ROOM_CLOSED", objectMapper.createObjectNode())
        );
    }

    public void publishRoomMutation(InMemoryRuntimeStore.RoomMutation mutation) {
        if (mutation == null) {
            return;
        }
        if (mutation.removedPlayerId() != null) {
            closePlayerSessions(mutation.roomCode(), mutation.removedPlayerId(), "SESSION_CLOSED");
        }
        if (mutation.deleted()) {
            broadcastToRoom(mutation.roomCode(), "ROOM_CLOSED", objectMapper.createObjectNode());
            return;
        }
        broadcastToRoom(mutation.roomCode(), "PUBLIC_UPDATE", lobbyPayload(mutation.room()));
    }

    private void handleConnect(WebSocketSession session, InboundMessage inbound) {
        String roomCode = inbound.payload.path("roomCode").asText("");
        String accessToken = inbound.payload.path("accessToken").asText("");
        String requestedGame = inbound.payload.path("game").asText("");

        if (roomCode.isBlank() || accessToken.isBlank()) {
            sendError(session, "BAD_MESSAGE: invalid envelope or type");
            closeQuietly(session);
            return;
        }

        Jwt jwt;
        try {
            jwt = jwtDecoder.decode(accessToken);
        } catch (JwtException exception) {
            sendError(session, "AUTH_REQUIRED: invalid access token");
            closeQuietly(session);
            return;
        }
        String userId = jwt.getSubject();
        if (userId == null || userId.isBlank()) {
            sendError(session, "AUTH_REQUIRED: invalid access token");
            closeQuietly(session);
            return;
        }

        RoomMetadataStore.StoredRoom storedRoom = roomMetadataStore.room(roomCode).orElse(null);
        if (storedRoom == null || storedRoom.participants().stream().noneMatch(player -> userId.equals(player.playerId()))) {
            sendError(session, "SESSION_NOT_READY: session validation unavailable");
            closeQuietly(session);
            return;
        }
        if (!runtimeStore.roomExists(roomCode)) {
            hydrateRuntimeRoom(storedRoom);
        }
        String token = MatchmakingService.runtimeToken(roomCode, userId);

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
        Optional<String> connectError = gameLoopService.handleConnect(roomCode, inbound.payload);
        if (connectError.isPresent()) {
            sendError(session, connectError.get());
            closeQuietly(session);
            return;
        }

        Optional<InMemoryRuntimeStore.PlayerSession> resolved = runtimeStore.resolveConnect(roomCode, token);
        if (resolved.isEmpty()) {
            sendError(session, "SESSION_NOT_READY: session validation unavailable");
            closeQuietly(session);
            return;
        }

        InMemoryRuntimeStore.PlayerSession playerSession = resolved.get();
        closeExistingSocketForToken(playerSession.token(), session.getId());
        bindingsById.put(session.getId(), ConnectionBinding.connected(roomCode, playerSession.playerId(), playerSession.token()));

        GameLoopService.RoomState state = gameLoopService.prepareSnapshot(roomCode, playerSession.playerId());
        ObjectNode payload = objectMapper.createObjectNode();

        // TEAM-UI-INTEGRATION: these snapshot fields are the server contract consumed by game-board UI.
        payload.set("publicState", state.publicState());
        JsonNode privateState = state.privateStateFor(playerSession.playerId());
        payload.set("privateState", privateState == null ? objectMapper.createObjectNode() : privateState);

        sendEnvelope(session, "STATE_SNAPSHOT", payload);
        publishLobbyState(roomCode);

        if (state.publicState().path("started").asBoolean(false)) {
            broadcastToRoom(roomCode, "PUBLIC_UPDATE", state.publicState());
            for (Map.Entry<String, ObjectNode> entry : state.privateStateByPlayer().entrySet()) {
                sendToPlayer(roomCode, entry.getKey(), "PRIVATE_UPDATE", entry.getValue());
            }
        }
        publishLobbyState(roomCode);
    }

    private void handleHeartbeat(WebSocketSession session, ConnectionBinding binding) {
        if (!runtimeStore.touchHeartbeat(binding.token)) {
            sendError(session, "SESSION_NOT_READY: session validation unavailable");
            closeQuietly(session);
            return;
        }

        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("at", Instant.now().toString());
        sendEnvelope(session, "HEARTBEAT_ACK", payload);
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
            publishResult(actorSession.getId(), binding.roomCode, inbound.type, result);
        });
    }

    private void publishResult(String actorSessionId, String roomCode, String actionType, GameLoopService.LoopResult result) {
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

        if ("START_GAME".equals(actionType)) {
            roomMetadataStore.updateRoomStatus(roomCode, InMemoryRuntimeStore.RoomStatus.IN_GAME);
        }

        if (result.finished()) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("winnerPlayerId", result.winnerPlayerId());
            matchHistoryStore.recordCompletedMatch(roomCode, result.winnerPlayerId(), result.publicUpdate());
            broadcastToRoom(roomCode, "GAME_FINISHED", payload);
        }
    }

    private void hydrateRuntimeRoom(RoomMetadataStore.StoredRoom room) {
        runtimeStore.mirrorRoom(room.roomCode(), room.selectedGame(), room.isPrivate(), room.hostPlayerId(), room.status());
        for (InMemoryRuntimeStore.PlayerSummary participant : room.participants()) {
            runtimeStore.joinRoom(
                    room.roomCode(),
                    participant.playerId(),
                    participant.username(),
                    MatchmakingService.runtimeToken(room.roomCode(), participant.playerId())
            );
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

    private ObjectNode lobbyPayload(InMemoryRuntimeStore.RoomSnapshot room) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("roomCode", room.roomCode());
        payload.put("hostPlayerId", room.hostPlayerId());
        payload.put("selectedGame", room.selectedGame());
        payload.put("status", room.status().name());
        payload.put("isPrivate", room.isPrivate());
        payload.put("version", runtimeStore.loadState(room.roomCode()).version());

        var players = payload.putArray("players");
        room.participants().forEach(player -> {
            ObjectNode playerPayload = objectMapper.createObjectNode();
            playerPayload.put("playerId", player.playerId());
            if (player.username() == null || player.username().isBlank()) {
                playerPayload.putNull("username");
            } else {
                playerPayload.put("username", player.username());
            }
            players.add(playerPayload);
        });
        return payload;
    }

    private void closeSessionByToken(String token, String reason) {
        for (Map.Entry<String, ConnectionBinding> entry : bindingsById.entrySet()) {
            ConnectionBinding binding = entry.getValue();
            if (!binding.connected || !token.equals(binding.token)) {
                continue;
            }
            WebSocketSession session = sessionsById.get(entry.getKey());
            if (session == null) {
                continue;
            }
            sendError(session, reason);
            closeQuietly(session, true);
        }
    }

    private void closeExistingSocketForToken(String token, String keepSessionId) {
        for (Map.Entry<String, ConnectionBinding> entry : bindingsById.entrySet()) {
            if (entry.getKey().equals(keepSessionId)) {
                continue;
            }
            ConnectionBinding binding = entry.getValue();
            if (!binding.connected || !token.equals(binding.token)) {
                continue;
            }
            WebSocketSession session = sessionsById.get(entry.getKey());
            if (session == null) {
                continue;
            }
            sendError(session, "SESSION_REPLACED");
            closeQuietly(session, false);
        }
    }

    private void closePlayerSessions(String roomCode, String playerId, String reason) {
        for (Map.Entry<String, ConnectionBinding> entry : bindingsById.entrySet()) {
            ConnectionBinding binding = entry.getValue();
            if (!binding.connected || !roomCode.equals(binding.roomCode) || !playerId.equals(binding.playerId)) {
                continue;
            }
            WebSocketSession session = sessionsById.get(entry.getKey());
            if (session == null) {
                continue;
            }
            sendError(session, reason);
            closeQuietly(session, false);
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
                closeQuietly(session, true);
            }
        }
    }

    private void closeQuietly(WebSocketSession session) {
        closeQuietly(session, true);
    }

    private void closeQuietly(WebSocketSession session, boolean removePlayer) {
        if (session == null) {
            return;
        }
        try {
            session.close();
        } catch (IOException ignored) {
            // ignored
        } finally {
            removeSession(session.getId(), removePlayer);
        }
    }

    private void removeSession(String sessionId, boolean removePlayer) {
        sessionsById.remove(sessionId);
        ConnectionBinding binding = bindingsById.remove(sessionId);
        if (binding == null || !binding.connected || !removePlayer) {
            return;
        }

        runtimeStore.disconnect(binding.token).ifPresent(this::publishRoomMutation);
    }

    private record InboundMessage(String type, JsonNode payload) {
    }

    private record ConnectionBinding(String roomCode, String playerId, String token, boolean connected) {
        static ConnectionBinding pending() {
            return new ConnectionBinding(null, null, null, false);
        }

        static ConnectionBinding connected(String roomCode, String playerId, String token) {
            return new ConnectionBinding(roomCode, playerId, token, true);
        }
    }
}
