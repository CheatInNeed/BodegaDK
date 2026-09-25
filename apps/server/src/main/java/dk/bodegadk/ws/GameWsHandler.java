package dk.bodegadk.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.logging.LogContext;
import dk.bodegadk.metrics.BodegaMetrics;
import io.micrometer.core.instrument.Timer;
import dk.bodegadk.runtime.GameLoopService;
import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.runtime.MatchmakingService;
import dk.bodegadk.runtime.MatchHistoryStore;
import dk.bodegadk.runtime.RoomMetadataStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(GameWsHandler.class);
    private static final Duration HEARTBEAT_TIMEOUT = Duration.ofSeconds(20);

    private final ObjectMapper objectMapper;
    private final InMemoryRuntimeStore runtimeStore;
    private final GameLoopService gameLoopService;
    private final RoomMetadataStore roomMetadataStore;
    private final MatchHistoryStore matchHistoryStore;
    private final JwtDecoder jwtDecoder;
    private final BodegaMetrics metrics;

    private final ConcurrentMap<String, WebSocketSession> sessionsById = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ConnectionBinding> bindingsById = new ConcurrentHashMap<>();

    public GameWsHandler(ObjectMapper objectMapper, InMemoryRuntimeStore runtimeStore, GameLoopService gameLoopService, RoomMetadataStore roomMetadataStore, MatchHistoryStore matchHistoryStore, JwtDecoder jwtDecoder, BodegaMetrics metrics) {
        this.objectMapper = objectMapper;
        this.runtimeStore = runtimeStore;
        this.gameLoopService = gameLoopService;
        this.roomMetadataStore = roomMetadataStore;
        this.matchHistoryStore = matchHistoryStore;
        this.jwtDecoder = jwtDecoder;
        this.metrics = metrics;
    }

    /** Sockets that completed CONNECT and are bound to a room (exported as a gauge). */
    public long connectedPlayerCount() {
        return bindingsById.values().stream().filter(ConnectionBinding::connected).count();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessionsById.put(session.getId(), session);
        bindingsById.put(session.getId(), ConnectionBinding.pending());
        try (LogContext ignored = LogContext.open().with(LogContext.WS_SESSION, session.getId())) {
            log.debug("WS opened");
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        ConnectionBinding binding = bindingsById.getOrDefault(session.getId(), ConnectionBinding.pending());
        try (LogContext ignored = logContext(session.getId(), binding)) {
            routeMessage(session, binding, message);
        }
    }

    private void routeMessage(WebSocketSession session, ConnectionBinding binding, TextMessage message) {
        InboundMessage inbound = parseInbound(message.getPayload());
        if (inbound == null || inbound.type == null || inbound.type.isBlank()) {
            log.warn("Rejected WS message: invalid envelope or type ({} chars)", message.getPayloadLength());
            sendError(session, "BAD_MESSAGE: invalid envelope or type");
            if (!binding.connected) {
                closeQuietly(session);
            }
            return;
        }

        if (!binding.connected && !"CONNECT".equals(inbound.type)) {
            log.warn("Rejected WS message {}: CONNECT must be the first message", LogContext.sanitize(inbound.type));
            sendError(session, "BAD_MESSAGE: CONNECT must be the first message");
            closeQuietly(session);
            return;
        }

        if (binding.connected && "CONNECT".equals(inbound.type)) {
            log.warn("Rejected duplicate CONNECT on an already connected socket");
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
        ConnectionBinding binding = bindingsById.get(session.getId());
        try (LogContext ignored = logContext(session.getId(), binding)) {
            if (binding != null && binding.connected) {
                log.info("Player disconnected (code={}, reason={})", status.getCode(), status.getReason());
            } else {
                log.debug("WS closed (code={}, reason={})", status.getCode(), status.getReason());
            }
            removeSession(session.getId(), true);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        try (LogContext ignored = logContext(session.getId(), bindingsById.get(session.getId()))) {
            log.warn("WS transport error: {}", exception.toString());
            log.debug("WS transport error details", exception);
            closeQuietly(session);
        }
    }

    @Scheduled(fixedDelay = 5000)
    public void sweepStaleConnections() {
        for (InMemoryRuntimeStore.ExpiredSession expired : runtimeStore.sweepExpiredSessions(HEARTBEAT_TIMEOUT)) {
            try (LogContext ignored = LogContext.open()
                    .with(LogContext.ROOM_CODE, expired.roomCode())
                    .with(LogContext.PLAYER_ID, expired.playerId())) {
                log.info("Heartbeat timeout: closing player session");
                metrics.heartbeatTimeout();
                closeSessionByToken(expired.token(), "HEARTBEAT_TIMEOUT");
                publishRoomMutation(expired.mutation());
            }
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
            log.info("Room {} closed", mutation.roomCode());
            broadcastToRoom(mutation.roomCode(), "ROOM_CLOSED", objectMapper.createObjectNode());
            return;
        }
        broadcastToRoom(mutation.roomCode(), "PUBLIC_UPDATE", lobbyPayload(mutation.room()));
    }

    private void handleConnect(WebSocketSession session, InboundMessage inbound) {
        String roomCode = inbound.payload.path("roomCode").asText("");
        String accessToken = inbound.payload.path("accessToken").asText("");
        String requestedGame = inbound.payload.path("game").asText("");

        try (LogContext context = LogContext.open().with(LogContext.ROOM_CODE, LogContext.sanitize(roomCode))) {
            if (roomCode.isBlank() || accessToken.isBlank()) {
                log.warn("CONNECT rejected: missing roomCode or accessToken");
                metrics.connectRejected("missing_fields");
                sendError(session, "BAD_MESSAGE: invalid envelope or type");
                closeQuietly(session);
                return;
            }

            Jwt jwt;
            try {
                jwt = jwtDecoder.decode(accessToken);
            } catch (JwtException exception) {
                log.warn("CONNECT rejected: invalid access token ({})", exception.getMessage());
                metrics.connectRejected("invalid_token");
                sendError(session, "AUTH_REQUIRED: invalid access token");
                closeQuietly(session);
                return;
            }
            String userId = jwt.getSubject();
            if (userId == null || userId.isBlank()) {
                log.warn("CONNECT rejected: access token has no subject");
                metrics.connectRejected("invalid_token");
                sendError(session, "AUTH_REQUIRED: invalid access token");
                closeQuietly(session);
                return;
            }
            context.with(LogContext.PLAYER_ID, userId);

            RoomMetadataStore.StoredRoom storedRoom = roomMetadataStore.room(roomCode).orElse(null);
            if (storedRoom == null) {
                log.warn("CONNECT rejected: room not found");
                metrics.connectRejected("room_not_found");
                sendError(session, "SESSION_NOT_READY: session validation unavailable");
                closeQuietly(session);
                return;
            }
            if (storedRoom.participants().stream().noneMatch(player -> userId.equals(player.playerId()))) {
                log.warn("CONNECT rejected: user is not a participant of the room");
                metrics.connectRejected("not_participant");
                sendError(session, "SESSION_NOT_READY: session validation unavailable");
                closeQuietly(session);
                return;
            }
            if (!runtimeStore.roomExists(roomCode)) {
                log.info("Restoring room into runtime memory from stored metadata");
                hydrateRuntimeRoom(storedRoom);
            }
            String token = MatchmakingService.runtimeToken(roomCode, userId);

            Optional<String> roomGameType = runtimeStore.roomGameType(roomCode);
            if (roomGameType.isEmpty()) {
                log.warn("CONNECT rejected: room has no game type in runtime memory");
                metrics.connectRejected("room_not_ready");
                sendError(session, "SESSION_NOT_READY: session validation unavailable");
                closeQuietly(session);
                return;
            }
            if (!requestedGame.isBlank() && !roomGameType.get().equalsIgnoreCase(requestedGame)) {
                log.warn("CONNECT rejected: client asked for game {} but room plays {}",
                        LogContext.sanitize(requestedGame), roomGameType.get());
                metrics.connectRejected("game_mismatch");
                sendError(session, "BAD_MESSAGE: invalid envelope or type");
                closeQuietly(session);
                return;
            }
            Optional<String> connectError = gameLoopService.handleConnect(roomCode, inbound.payload);
            if (connectError.isPresent()) {
                log.warn("CONNECT rejected by game engine: {}", connectError.get());
                metrics.connectRejected("engine_rejected");
                sendError(session, connectError.get());
                closeQuietly(session);
                return;
            }

            Optional<InMemoryRuntimeStore.PlayerSession> resolved = runtimeStore.resolveConnect(roomCode, token);
            if (resolved.isEmpty()) {
                log.warn("CONNECT rejected: runtime session could not be resolved");
                metrics.connectRejected("session_unresolved");
                sendError(session, "SESSION_NOT_READY: session validation unavailable");
                closeQuietly(session);
                return;
            }

            InMemoryRuntimeStore.PlayerSession playerSession = resolved.get();
            closeExistingSocketForToken(playerSession.token(), session.getId());
            bindingsById.put(session.getId(), ConnectionBinding.connected(roomCode, playerSession.playerId(), playerSession.token()));
            log.info("Player connected (game={})", roomGameType.get());

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
    }

    private void handleHeartbeat(WebSocketSession session, ConnectionBinding binding) {
        if (!runtimeStore.touchHeartbeat(binding.token)) {
            log.warn("Heartbeat rejected: runtime session no longer exists");
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
        String actionType = LogContext.sanitize(inbound.type);

        runtimeStore.submit(binding.roomCode, () -> {
            // The room worker runs on another thread, so the log tags must be set again here.
            try (LogContext ignored = logContext(actorSession.getId(), binding).with(LogContext.REQUEST_ID, command.requestId())) {
                Timer.Sample timer = metrics.startTimer();
                String game = runtimeStore.roomGameType(binding.roomCode).orElse(null);
                String outcome = BodegaMetrics.OUTCOME_OK;
                try {
                    log.debug("Handling game action {}", actionType);
                    GameLoopService.LoopResult result = gameLoopService.handleAction(command);
                    if (result == null || result.isError()) {
                        outcome = BodegaMetrics.OUTCOME_REJECTED;
                    }
                    publishResult(actorSession.getId(), binding.roomCode, inbound.type, result);
                } catch (RuntimeException exception) {
                    outcome = BodegaMetrics.OUTCOME_CRASH;
                    log.error("Game action {} failed", actionType, exception);
                    sendError(sessionsById.get(actorSession.getId()), "RULES_NOT_AVAILABLE: action failed on server");
                } finally {
                    metrics.recordGameAction(timer, game, outcome);
                }
            }
        });
    }

    private void publishResult(String actorSessionId, String roomCode, String actionType, GameLoopService.LoopResult result) {
        WebSocketSession actor = sessionsById.get(actorSessionId);

        if (result == null) {
            log.warn("Game action {} returned no result", LogContext.sanitize(actionType));
            sendError(actor, "RULES_NOT_AVAILABLE: engine returned no result");
            return;
        }
        if (result.isError()) {
            log.debug("Game action {} rejected: {}", LogContext.sanitize(actionType), result.errorMessage());
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

        String game = runtimeStore.roomGameType(roomCode).orElse(null);
        if ("START_GAME".equals(actionType)) {
            log.info("Game started");
            metrics.gameStarted(game);
            roomMetadataStore.updateRoomStatus(roomCode, InMemoryRuntimeStore.RoomStatus.IN_GAME);
        }

        if (result.finished()) {
            log.info("Game finished (winner={})", result.winnerPlayerId());
            metrics.gameFinished(game);
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("winnerPlayerId", result.winnerPlayerId());
            try {
                matchHistoryStore.recordCompletedMatch(roomCode, result.winnerPlayerId(), result.publicUpdate());
            } catch (RuntimeException exception) {
                // Players should still see the result even if saving match history fails.
                log.error("Failed to save match history", exception);
                metrics.matchHistoryFailure();
            }
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
            log.info("Replacing older socket for the same player (session {})", entry.getKey());
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
            // Not logging the parser message: it can echo raw message content, which may contain an access token.
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
            } catch (IOException exception) {
                log.warn("Failed to send {} to WS session {}: {}", type, session.getId(), exception.getMessage());
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
        } catch (IOException exception) {
            log.debug("Ignoring error while closing WS session {}: {}", session.getId(), exception.getMessage());
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

    private static LogContext logContext(String sessionId, ConnectionBinding binding) {
        LogContext context = LogContext.open().with(LogContext.WS_SESSION, sessionId);
        if (binding != null && binding.connected) {
            context.with(LogContext.ROOM_CODE, binding.roomCode).with(LogContext.PLAYER_ID, binding.playerId);
        }
        return context;
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
