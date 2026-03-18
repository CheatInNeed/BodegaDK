package dk.bodegadk.runtime;

// TEAM-DB-INTEGRATION: replace this in-memory runtime store with persistent adapters when DB module is ready.

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.games.casino.CasinoState;
import dk.bodegadk.server.domain.games.highcard.HighCardState;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@Component
public class InMemoryRuntimeStore {
    private static final String DEFAULT_GAME_TYPE = "snyd";

    private final SecureRandom random = new SecureRandom();
    private final ConcurrentMap<String, RoomRecord> rooms = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, SessionRecord> sessionsByToken = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, GameLoopService.RoomState> statesByRoom = new ConcurrentHashMap<>();
    // TEAM-DB-INTEGRATION: replace in-memory domain state map with durable game-state persistence.
    private final ConcurrentMap<String, HighCardState> highCardStatesByRoom = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, CasinoState> casinoStatesByRoom = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ExecutorService> roomExecutors = new ConcurrentHashMap<>();

    public String createRoom(String gameType) {
        String normalizedGameType = normalizeGameType(gameType);
        String roomCode;
        do {
            roomCode = randomCode();
        } while (rooms.putIfAbsent(roomCode, new RoomRecord(roomCode, normalizedGameType)) != null);
        return roomCode;
    }

    public boolean roomExists(String roomCode) {
        return rooms.containsKey(roomCode);
    }

    public List<String> participants(String roomCode) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return List.of();
        }
        synchronized (room) {
            return List.copyOf(room.participants);
        }
    }

    public Optional<String> roomGameType(String roomCode) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return Optional.empty();
        }
        return Optional.of(room.gameType);
    }

    public boolean isParticipant(String roomCode, String playerId) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return false;
        }
        synchronized (room) {
            return room.participants.contains(playerId);
        }
    }

    public void joinRoom(String roomCode, String playerId, String token) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            throw new IllegalArgumentException("Room does not exist: " + roomCode);
        }

        synchronized (room) {
            if (!room.participants.contains(playerId) && room.participants.size() >= maxPlayersFor(room.gameType)) {
                throw new IllegalStateException("Room is full");
            }
            if (!room.participants.contains(playerId)) {
                room.participants.add(playerId);
            }
        }

        sessionsByToken.put(token, new SessionRecord(roomCode, playerId));
    }

    public Optional<PlayerSession> resolveConnect(String roomCode, String token) {
        SessionRecord session = sessionsByToken.get(token);
        if (session == null || !session.roomCode.equals(roomCode)) {
            RoomRecord room = rooms.get(roomCode);
            if (room == null) {
                return Optional.empty();
            }
            synchronized (room) {
                if (room.participants.size() >= maxPlayersFor(room.gameType)) {
                    return Optional.empty();
                }
                String playerId = "p" + (room.participants.size() + 1);
                room.participants.add(playerId);
                sessionsByToken.put(token, new SessionRecord(roomCode, playerId));
                return Optional.of(new PlayerSession(roomCode, playerId));
            }
        }
        return Optional.of(new PlayerSession(session.roomCode, session.playerId));
    }

    public GameLoopService.RoomState loadState(String roomCode) {
        return statesByRoom.computeIfAbsent(roomCode, this::newState);
    }

    public void saveState(String roomCode, GameLoopService.RoomState state) {
        statesByRoom.put(roomCode, state);
    }

    public HighCardState loadOrCreateHighCardState(String roomCode, Supplier<HighCardState> initializer) {
        return highCardStatesByRoom.computeIfAbsent(roomCode, key -> initializer.get());
    }

    public void saveHighCardState(String roomCode, HighCardState state) {
        highCardStatesByRoom.put(roomCode, state);
    }

    public CasinoState loadOrCreateCasinoState(String roomCode, Supplier<CasinoState> initializer) {
        return casinoStatesByRoom.computeIfAbsent(roomCode, key -> initializer.get());
    }

    public void saveCasinoState(String roomCode, CasinoState state) {
        casinoStatesByRoom.put(roomCode, state);
    }

    public void saveCasinoValueMap(String roomCode, Map<String, List<Integer>> valueMap) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return;
        }
        synchronized (room) {
            room.casinoValueMap = new ConcurrentHashMap<>(valueMap);
        }
    }

    public Optional<Map<String, List<Integer>>> casinoValueMap(String roomCode) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null || room.casinoValueMap == null) {
            return Optional.empty();
        }
        synchronized (room) {
            Map<String, List<Integer>> copy = new ConcurrentHashMap<>();
            room.casinoValueMap.forEach((card, values) -> copy.put(card, List.copyOf(values)));
            return Optional.of(copy);
        }
    }

    public void submit(String roomCode, Runnable command) {
        ExecutorService executor = roomExecutors.computeIfAbsent(roomCode, key -> Executors.newSingleThreadExecutor());
        executor.submit(command);
    }

    private GameLoopService.RoomState newState(String roomCode) {
        ObjectNode publicState = JsonNodeFactory.instance.objectNode();
        publicState.put("roomCode", roomCode);
        publicState.put("version", 0);
        publicState.set("players", JsonNodeFactory.instance.arrayNode());
        return new GameLoopService.RoomState(roomCode, 0, publicState, new ConcurrentHashMap<>());
    }

    public GameLoopService.RoomState refreshPlayers(String roomCode) {
        GameLoopService.RoomState state = loadState(roomCode);
        ObjectNode publicState = state.publicState().deepCopy();
        ArrayNode players = JsonNodeFactory.instance.arrayNode();
        participants(roomCode).forEach(players::add);
        publicState.set("players", players);

        GameLoopService.RoomState updated = state.withPublicState(publicState);
        saveState(roomCode, updated);
        return updated;
    }

    private String normalizeGameType(String gameType) {
        if (gameType == null || gameType.isBlank()) {
            return DEFAULT_GAME_TYPE;
        }
        return gameType.trim().toLowerCase(Locale.ROOT);
    }

    private int maxPlayersFor(String gameType) {
        return switch (normalizeGameType(gameType)) {
            case "highcard" -> 1;
            case "casino" -> 2;
            default -> Integer.MAX_VALUE;
        };
    }

    private String randomCode() {
        char[] chars = new char[6];
        for (int i = 0; i < chars.length; i++) {
            chars[i] = (char) ('A' + random.nextInt(26));
        }
        return new String(chars).toUpperCase(Locale.ROOT);
    }

    @PreDestroy
    public void shutdownExecutors() {
        for (ExecutorService executor : roomExecutors.values()) {
            executor.shutdown();
        }
        for (ExecutorService executor : roomExecutors.values()) {
            try {
                executor.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    public record PlayerSession(String roomCode, String playerId) {
    }

    private static final class RoomRecord {
        private final String roomCode;
        private final String gameType;
        private final List<String> participants = new ArrayList<>();
        private Map<String, List<Integer>> casinoValueMap;

        private RoomRecord(String roomCode, String gameType) {
            this.roomCode = roomCode;
            this.gameType = gameType;
        }
    }

    private record SessionRecord(String roomCode, String playerId) {
    }
}
