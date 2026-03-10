package dk.bodegadk.server.ws;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dk.bodegadk.server.domain.rooms.ActiveGameRegistry;
import dk.bodegadk.server.domain.rooms.RoomService;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final RoomService roomService;
    private final Map<String, Set<WebSocketSession>> roomSessions = new ConcurrentHashMap<>();
    private final Map<String, SessionBinding> bindings = new ConcurrentHashMap<>();

    public GameWebSocketHandler(ObjectMapper objectMapper, RoomService roomService) {
        this.objectMapper = objectMapper;
        this.roomService = roomService;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Map<String, Object> envelope = objectMapper.readValue(message.getPayload(), new TypeReference<>() {});
        String type = envelope.get("type") instanceof String value ? value : "";
        Map<String, Object> payload = envelope.get("payload") instanceof Map<?, ?> map
                ? castPayload(map)
                : Map.of();

        if ("CONNECT".equals(type)) {
            handleConnect(session, payload);
            return;
        }

        SessionBinding binding = bindings.get(session.getId());
        if (binding == null) {
            send(session, "ERROR", Map.of("message", "Must CONNECT before sending actions"));
            return;
        }

        try {
            ActiveGameRegistry.UpdateResult result = roomService.applyGameAction(binding.roomCode(), binding.playerId(), type, payload);
            broadcast(binding.roomCode(), "PUBLIC_UPDATE", result.publicState());
            for (Map.Entry<String, Map<String, Object>> entry : result.privateStates().entrySet()) {
                sendToPlayer(binding.roomCode(), entry.getKey(), "PRIVATE_UPDATE", entry.getValue());
            }
            if (result.winnerPlayerId() != null) {
                broadcast(binding.roomCode(), "GAME_FINISHED", Map.of("winnerPlayerId", result.winnerPlayerId()));
            }
        } catch (RuntimeException exception) {
            send(session, "ERROR", Map.of("message", exception.getMessage()));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        SessionBinding binding = bindings.remove(session.getId());
        if (binding == null) {
            return;
        }

        Set<WebSocketSession> sessions = roomSessions.get(binding.roomCode());
        if (sessions != null) {
            sessions.remove(session);
            if (sessions.isEmpty()) {
                roomSessions.remove(binding.roomCode());
            }
        }
    }

    private void handleConnect(WebSocketSession session, Map<String, Object> payload) throws IOException {
        String roomCode = payload.get("roomCode") instanceof String value ? value : "";
        String token = payload.get("token") instanceof String value ? value : "";
        if (roomCode.isBlank() || token.isBlank()) {
            send(session, "ERROR", Map.of("message", "CONNECT requires roomCode and token"));
            return;
        }

        try {
            ActiveGameRegistry.Snapshot snapshot = roomService.connectToGame(roomCode, token);
            bindings.put(session.getId(), new SessionBinding(roomCode.toUpperCase(), token));
            roomSessions.computeIfAbsent(roomCode.toUpperCase(), ignored -> ConcurrentHashMap.newKeySet()).add(session);
            send(session, "STATE_SNAPSHOT", Map.of(
                    "publicState", snapshot.publicState(),
                    "privateState", snapshot.privateState()
            ));
        } catch (RuntimeException exception) {
            send(session, "ERROR", Map.of("message", exception.getMessage()));
        }
    }

    private void broadcast(String roomCode, String type, Map<String, Object> payload) throws IOException {
        Set<WebSocketSession> sessions = roomSessions.get(roomCode);
        if (sessions == null) {
            return;
        }
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                send(session, type, payload);
            }
        }
    }

    private void sendToPlayer(String roomCode, String playerId, String type, Map<String, Object> payload) throws IOException {
        Set<WebSocketSession> sessions = roomSessions.get(roomCode);
        if (sessions == null) {
            return;
        }
        for (WebSocketSession session : sessions) {
            SessionBinding binding = bindings.get(session.getId());
            if (binding != null && binding.playerId().equals(playerId) && session.isOpen()) {
                send(session, type, payload);
            }
        }
    }

    private void send(WebSocketSession session, String type, Map<String, Object> payload) throws IOException {
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(Map.of(
                "type", type,
                "payload", payload
        ))));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castPayload(Map<?, ?> payload) {
        return (Map<String, Object>) payload;
    }

    private record SessionBinding(String roomCode, String playerId) {}
}
