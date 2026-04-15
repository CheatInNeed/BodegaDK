package dk.bodegadk.runtime;

// TEAM-DB-INTEGRATION: replace this in-memory runtime store with persistent adapters when DB module is ready.

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.games.krig.KrigState;
import dk.bodegadk.server.domain.games.casino.CasinoState;
import dk.bodegadk.server.domain.games.highcard.HighCardState;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
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
    private final ConcurrentMap<String, KrigState> krigStatesByRoom = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, CasinoState> casinoStatesByRoom = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ExecutorService> roomExecutors = new ConcurrentHashMap<>();

    public String createRoom(String gameType) {
        return createRoom(gameType, false, null);
    }

    public String createRoom(String gameType, boolean isPrivate, String hostPlayerId) {
        String normalizedGameType = normalizeGameType(gameType);
        String roomCode;
        do {
            roomCode = randomCode();
        } while (rooms.putIfAbsent(roomCode, new RoomRecord(
                roomCode,
                hostPlayerId,
                isPrivate,
                normalizedGameType,
                RoomStatus.LOBBY
        )) != null);
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
        synchronized (room) {
            return Optional.of(room.selectedGame);
        }
    }

    public Optional<RoomSnapshot> roomSnapshot(String roomCode) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return Optional.empty();
        }
        synchronized (room) {
            return Optional.of(toSnapshot(room));
        }
    }

    public List<RoomSummary> publicLobbyRooms() {
        return rooms.values().stream()
                .map(room -> {
                    synchronized (room) {
                        if (room.isPrivate || room.status != RoomStatus.LOBBY) {
                            return null;
                        }
                        return toSummary(room);
                    }
                })
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(RoomSummary::roomCode))
                .toList();
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

    public PlayerSession joinRoom(String roomCode, String playerId, String token) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            throw new IllegalArgumentException("Room does not exist: " + roomCode);
        }

        Instant now = Instant.now();
        synchronized (room) {
            if (!room.participants.contains(playerId) && room.participants.size() >= maxPlayersFor(room.selectedGame)) {
                throw new IllegalStateException("Room is full");
            }
            if (!room.participants.contains(playerId)) {
                room.participants.add(playerId);
            }
            if (blank(room.hostPlayerId)) {
                room.hostPlayerId = playerId;
            }
        }

        sessionsByToken.put(token, new SessionRecord(roomCode, playerId, now, false));
        refreshPlayers(roomCode);
        return new PlayerSession(roomCode, playerId, token);
    }

    public Optional<PlayerSession> resolveConnect(String roomCode, String token) {
        SessionRecord session = sessionsByToken.get(token);
        if (session == null || !session.roomCode.equals(roomCode)) {
            RoomRecord room = rooms.get(roomCode);
            if (room == null) {
                return Optional.empty();
            }
            synchronized (room) {
                if (room.participants.size() >= maxPlayersFor(room.selectedGame)) {
                    return Optional.empty();
                }
                String playerId = "p" + (room.participants.size() + 1);
                room.participants.add(playerId);
                sessionsByToken.put(token, new SessionRecord(roomCode, playerId));
                return Optional.of(new PlayerSession(roomCode, playerId, token));
            }
        }

        sessionsByToken.computeIfPresent(token, (key, current) -> current.connected(Instant.now()));
        return Optional.of(new PlayerSession(session.roomCode, session.playerId, token));
    }

    public boolean touchHeartbeat(String token) {
        return sessionsByToken.computeIfPresent(token, (key, session) -> session.connected(Instant.now())) != null;
    }

    public boolean touchHeartbeat(String roomCode, String playerId) {
        Instant now = Instant.now();
        boolean touched = false;
        for (var entry : sessionsByToken.entrySet()) {
            SessionRecord session = entry.getValue();
            if (session.roomCode.equals(roomCode) && session.playerId.equals(playerId)) {
                sessionsByToken.put(entry.getKey(), session.connected(now));
                touched = true;
            }
        }
        return touched;
    }

    public Optional<RoomMutation> leaveRoom(String roomCode, String token) {
        SessionRecord session = sessionsByToken.get(token);
        if (session == null || !session.roomCode.equals(roomCode)) {
            return Optional.empty();
        }
        return removePlayer(roomCode, session.playerId);
    }

    public Optional<RoomMutation> disconnect(String token) {
        SessionRecord session = sessionsByToken.get(token);
        if (session == null) {
            return Optional.empty();
        }
        sessionsByToken.computeIfPresent(token, (key, current) -> current.disconnected());
        return Optional.empty();
    }

    public Optional<RoomMutation> kickPlayer(String roomCode, String hostToken, String targetPlayerId) {
        SessionRecord hostSession = sessionsByToken.get(hostToken);
        if (hostSession == null || !hostSession.roomCode.equals(roomCode)) {
            return Optional.empty();
        }

        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return Optional.empty();
        }

        synchronized (room) {
            if (!Objects.equals(room.hostPlayerId, hostSession.playerId)) {
                throw new IllegalStateException("Only the host can kick players");
            }
            if (!room.participants.contains(targetPlayerId)) {
                return Optional.empty();
            }
            if (Objects.equals(room.hostPlayerId, targetPlayerId)) {
                throw new IllegalStateException("Host cannot kick themselves");
            }
        }

        return removePlayer(roomCode, targetPlayerId);
    }

    public List<ExpiredSession> sweepExpiredSessions(Duration maxAge) {
        Instant cutoff = Instant.now().minus(maxAge);
        List<ExpiredSession> expired = new ArrayList<>();

        for (var entry : sessionsByToken.entrySet()) {
            SessionRecord session = entry.getValue();
            if (!session.lastHeartbeat.isBefore(cutoff)) {
                continue;
            }

            Optional<RoomMutation> mutation = removePlayer(session.roomCode, session.playerId);
            mutation.ifPresent(value -> expired.add(new ExpiredSession(entry.getKey(), session.roomCode, session.playerId, value)));
        }

        return expired;
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

    public KrigState loadOrCreateKrigState(String roomCode, Supplier<KrigState> initializer) {
        return krigStatesByRoom.computeIfAbsent(roomCode, key -> initializer.get());
    }

    public void saveKrigState(String roomCode, KrigState state) {
        krigStatesByRoom.put(roomCode, state);
    }

    public Optional<RoomMutation> selectGame(String roomCode, String hostPlayerId, String selectedGame) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return Optional.empty();
        }

        RoomMutation mutation;
        synchronized (room) {
            if (room.status != RoomStatus.LOBBY) {
                throw new IllegalStateException("Cannot change game after match start");
            }
            if (!Objects.equals(room.hostPlayerId, hostPlayerId)) {
                throw new IllegalStateException("Only the host can select the game");
            }
            room.selectedGame = normalizeGameType(selectedGame);
            clearGameStates(roomCode);
            mutation = RoomMutation.updated(toSnapshot(room), null);
        }

        refreshPlayers(roomCode);
        return Optional.of(mutation);
    }

    public Optional<RoomMutation> markRoomInGame(String roomCode, String hostPlayerId) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return Optional.empty();
        }

        RoomMutation mutation;
        synchronized (room) {
            if (room.status != RoomStatus.LOBBY) {
                throw new IllegalStateException("Game already started");
            }
            if (!Objects.equals(room.hostPlayerId, hostPlayerId)) {
                throw new IllegalStateException("Only the host can start the game");
            }
            room.status = RoomStatus.IN_GAME;
            mutation = RoomMutation.updated(toSnapshot(room), null);
        }

        refreshPlayers(roomCode);
        return Optional.of(mutation);
    }

    public Optional<RoomMutation> resetRoomToLobby(String roomCode) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return Optional.empty();
        }

        RoomMutation mutation;
        synchronized (room) {
            room.status = RoomStatus.LOBBY;
            mutation = RoomMutation.updated(toSnapshot(room), null);
        }
        refreshPlayers(roomCode);
        return Optional.of(mutation);
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
        return enrichState(roomCode, new GameLoopService.RoomState(roomCode, 0, publicState, new ConcurrentHashMap<>()));
    }

    public GameLoopService.RoomState refreshPlayers(String roomCode) {
        GameLoopService.RoomState state = loadState(roomCode);
        GameLoopService.RoomState updated = enrichState(roomCode, state);
        saveState(roomCode, updated);
        return updated;
    }

    private Optional<RoomMutation> removePlayer(String roomCode, String playerId) {
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            removeSessionsForPlayer(roomCode, playerId);
            return Optional.empty();
        }

        RoomMutation mutation;
        synchronized (room) {
            if (!room.participants.remove(playerId)) {
                removeSessionsForPlayer(roomCode, playerId);
                return Optional.empty();
            }

            removeSessionsForPlayer(roomCode, playerId);

            if (room.participants.isEmpty()) {
                rooms.remove(roomCode, room);
                clearRoomResources(roomCode);
                mutation = RoomMutation.deleted(roomCode, playerId);
            } else {
                if (Objects.equals(room.hostPlayerId, playerId)) {
                    room.hostPlayerId = room.participants.getFirst();
                }
                mutation = RoomMutation.updated(toSnapshot(room), playerId);
            }
        }

        if (!mutation.deleted()) {
            refreshPlayers(roomCode);
        }
        return Optional.of(mutation);
    }

    private GameLoopService.RoomState enrichState(String roomCode, GameLoopService.RoomState state) {
        ObjectNode publicState = state.publicState().deepCopy();
        publicState.put("roomCode", roomCode);

        ArrayNode players = JsonNodeFactory.instance.arrayNode();
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            publicState.set("players", players);
            publicState.putNull("hostPlayerId");
            publicState.put("selectedGame", DEFAULT_GAME_TYPE);
            publicState.put("status", RoomStatus.LOBBY.name());
            publicState.put("isPrivate", false);
            return state.withPublicState(publicState);
        }

        synchronized (room) {
            room.participants.forEach(players::add);
            publicState.set("players", players);
            if (blank(room.hostPlayerId)) {
                publicState.putNull("hostPlayerId");
            } else {
                publicState.put("hostPlayerId", room.hostPlayerId);
            }
            publicState.put("selectedGame", room.selectedGame);
            publicState.put("status", room.status.name());
            publicState.put("isPrivate", room.isPrivate);
        }
        return state.withPublicState(publicState);
    }

    private RoomSummary toSummary(RoomRecord room) {
        return new RoomSummary(
                room.roomCode,
                room.hostPlayerId,
                room.selectedGame,
                room.status.name(),
                room.participants.size(),
                List.copyOf(room.participants)
        );
    }

    private RoomSnapshot toSnapshot(RoomRecord room) {
        return new RoomSnapshot(
                room.roomCode,
                room.hostPlayerId,
                room.isPrivate,
                room.selectedGame,
                room.status,
                List.copyOf(room.participants)
        );
    }

    private void removeSessionsForPlayer(String roomCode, String playerId) {
        for (var entry : sessionsByToken.entrySet()) {
            SessionRecord session = entry.getValue();
            if (session.roomCode.equals(roomCode) && session.playerId.equals(playerId)) {
                sessionsByToken.remove(entry.getKey(), session);
            }
        }
    }

    private void clearRoomResources(String roomCode) {
        statesByRoom.remove(roomCode);
        clearGameStates(roomCode);
        ExecutorService executor = roomExecutors.remove(roomCode);
        if (executor != null) {
            executor.shutdown();
        }
    }

    private void clearGameStates(String roomCode) {
        highCardStatesByRoom.remove(roomCode);
        krigStatesByRoom.remove(roomCode);
        casinoStatesByRoom.remove(roomCode);
        RoomRecord room = rooms.get(roomCode);
        if (room == null) {
            return;
        }
        synchronized (room) {
            room.casinoValueMap = null;
        }
    }

    private String normalizeGameType(String gameType) {
        if (gameType == null || gameType.isBlank()) {
            return DEFAULT_GAME_TYPE;
        }
        return gameType.trim().toLowerCase(Locale.ROOT);
    }

    private int maxPlayersFor(String gameType) {
        return switch (normalizeGameType(gameType)) {
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

    private boolean blank(String value) {
        return value == null || value.isBlank();
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

    public enum RoomStatus {
        LOBBY,
        IN_GAME
    }

    public record PlayerSession(String roomCode, String playerId, String token) {
    }

    public record RoomSummary(
            String roomCode,
            String hostPlayerId,
            String selectedGame,
            String status,
            int playerCount,
            List<String> participants
    ) {
    }

    public record RoomSnapshot(
            String roomCode,
            String hostPlayerId,
            boolean isPrivate,
            String selectedGame,
            RoomStatus status,
            List<String> participants
    ) {
    }

    public record RoomMutation(String roomCode, RoomSnapshot room, boolean deleted, String removedPlayerId) {
        static RoomMutation updated(RoomSnapshot room, String removedPlayerId) {
            return new RoomMutation(room.roomCode(), room, false, removedPlayerId);
        }

        static RoomMutation deleted(String roomCode, String removedPlayerId) {
            return new RoomMutation(roomCode, null, true, removedPlayerId);
        }
    }

    public record ExpiredSession(String token, String roomCode, String playerId, RoomMutation mutation) {
    }

    private static final class RoomRecord {
        private final String roomCode;
        private final List<String> participants = new ArrayList<>();
        private String hostPlayerId;
        private final boolean isPrivate;
        private String selectedGame;
        private RoomStatus status;
        private Map<String, List<Integer>> casinoValueMap;

        private RoomRecord(String roomCode, String hostPlayerId, boolean isPrivate, String selectedGame, RoomStatus status) {
            this.roomCode = roomCode;
            this.hostPlayerId = hostPlayerId;
            this.isPrivate = isPrivate;
            this.selectedGame = selectedGame;
            this.status = status;
        }
    }

    private record SessionRecord(String roomCode, String playerId, Instant lastHeartbeat, boolean connected) {
        private SessionRecord(String roomCode, String playerId) {
            this(roomCode, playerId, Instant.now(), false);
        }

        private SessionRecord connected(Instant now) {
            return new SessionRecord(roomCode, playerId, now, true);
        }

        private SessionRecord disconnected() {
            return new SessionRecord(roomCode, playerId, lastHeartbeat, false);
        }
    }
}
