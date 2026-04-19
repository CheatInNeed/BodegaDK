package dk.bodegadk.runtime;

// TEAM-DB-INTEGRATION: replace this in-memory runtime store with persistent adapters when DB module is ready.

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.server.domain.games.krig.KrigState;
import dk.bodegadk.server.domain.games.casino.CasinoState;
import dk.bodegadk.server.domain.games.highcard.HighCardState;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
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
    private final RoomMetadataStore roomMetadataStore;
    private final GameCatalogService gameCatalogService;
    private final ConcurrentMap<String, SessionRecord> sessionsByToken = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, GameLoopService.RoomState> statesByRoom = new ConcurrentHashMap<>();
    // TEAM-DB-INTEGRATION: replace in-memory domain state map with durable game-state persistence.
    private final ConcurrentMap<String, HighCardState> highCardStatesByRoom = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, KrigState> krigStatesByRoom = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, CasinoState> casinoStatesByRoom = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ExecutorService> roomExecutors = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Object> roomLocks = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Map<String, List<Integer>>> casinoValueMapsByRoom = new ConcurrentHashMap<>();

    public InMemoryRuntimeStore() {
        this(new InMemoryRoomMetadataStore(), new GameCatalogService());
    }

    @Autowired
    public InMemoryRuntimeStore(RoomMetadataStore roomMetadataStore, GameCatalogService gameCatalogService) {
        this.roomMetadataStore = roomMetadataStore;
        this.gameCatalogService = gameCatalogService;
    }

    public String createRoom(String gameType) {
        return createRoom(gameType, false, null);
    }

    public String createRoom(String gameType, boolean isPrivate, String hostPlayerId) {
        String normalizedGameType = normalizeGameType(gameType);
        String roomCode;
        do {
            roomCode = randomCode();
        } while (roomMetadataStore.roomExists(roomCode));
        roomMetadataStore.createRoom(roomCode, hostPlayerId, isPrivate, normalizedGameType, RoomStatus.LOBBY);
        return roomCode;
    }

    public boolean roomExists(String roomCode) {
        return roomMetadataStore.roomExists(roomCode);
    }

    public List<String> participants(String roomCode) {
        return roomSnapshot(roomCode).map(RoomSnapshot::participantIds).orElse(List.of());
    }

    public Optional<String> roomGameType(String roomCode) {
        return roomSnapshot(roomCode).map(RoomSnapshot::selectedGame);
    }

    public Optional<RoomSnapshot> roomSnapshot(String roomCode) {
        return roomMetadataStore.room(roomCode).map(this::toSnapshot);
    }

    public List<RoomSummary> publicLobbyRooms() {
        return roomMetadataStore.publicRooms().stream()
                .filter(room -> room.participants().size() < maxPlayersFor(room.selectedGame()))
                .map(this::toSummary)
                .sorted(Comparator.comparing(RoomSummary::roomCode))
                .toList();
    }

    public boolean isParticipant(String roomCode, String playerId) {
        return roomSnapshot(roomCode)
                .map(room -> findParticipantIndex(room.participants, playerId) >= 0)
                .orElse(false);
    }

    public PlayerSession joinRoom(String roomCode, String playerId, String username, String token) {
        Instant now = Instant.now();
        synchronized (roomLock(roomCode)) {
            RoomSnapshot room = roomSnapshot(roomCode)
                    .orElseThrow(() -> new IllegalArgumentException("Room does not exist: " + roomCode));
            int existingIndex = findParticipantIndex(room.participants, playerId);
            if (existingIndex < 0 && room.participants.size() >= maxPlayersFor(room.selectedGame)) {
                throw new IllegalStateException("Room is full");
            }
            if (existingIndex < 0 && room.status == RoomStatus.IN_GAME && room.isPrivate) {
                throw new IllegalStateException("Private room is already running");
            }
            roomMetadataStore.upsertParticipant(roomCode, playerId, normalizeUsername(username));
            if (blank(room.hostPlayerId)) {
                roomMetadataStore.updateRoomHost(roomCode, playerId);
            }
        }

        sessionsByToken.put(token, new SessionRecord(roomCode, playerId, now, false));
        refreshPlayers(roomCode);
        return new PlayerSession(roomCode, playerId, token);
    }

    public Optional<PlayerSession> resolveConnect(String roomCode, String token) {
        SessionRecord session = sessionsByToken.get(token);
        if (session == null || !session.roomCode.equals(roomCode)) {
            synchronized (roomLock(roomCode)) {
                RoomSnapshot room = roomSnapshot(roomCode).orElse(null);
                if (room == null) {
                    return Optional.empty();
                }
                if (room.participants.size() >= maxPlayersFor(room.selectedGame)) {
                    return Optional.empty();
                }
                String playerId = "p" + (room.participants.size() + 1);
                roomMetadataStore.upsertParticipant(roomCode, playerId, null);
                sessionsByToken.put(token, new SessionRecord(roomCode, playerId));
                refreshPlayers(roomCode);
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

        RoomSnapshot room = roomSnapshot(roomCode).orElse(null);
        if (room == null) {
            return Optional.empty();
        }

        synchronized (roomLock(roomCode)) {
            if (!Objects.equals(room.hostPlayerId, hostSession.playerId)) {
                throw new IllegalStateException("Only the host can kick players");
            }
            if (findParticipantIndex(room.participants, targetPlayerId) < 0) {
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
        RoomSnapshot room = roomSnapshot(roomCode).orElse(null);
        if (room == null) {
            return Optional.empty();
        }

        RoomMutation mutation;
        synchronized (roomLock(roomCode)) {
            if (room.status != RoomStatus.LOBBY) {
                throw new IllegalStateException("Cannot change game after match start");
            }
            if (!Objects.equals(room.hostPlayerId, hostPlayerId)) {
                throw new IllegalStateException("Only the host can select the game");
            }
            roomMetadataStore.updateRoomGameType(roomCode, normalizeGameType(selectedGame));
            clearGameStates(roomCode);
            mutation = RoomMutation.updated(roomSnapshot(roomCode).orElseThrow(), null);
        }

        refreshPlayers(roomCode);
        return Optional.of(mutation);
    }

    public Optional<RoomMutation> markRoomInGame(String roomCode, String hostPlayerId) {
        RoomSnapshot room = roomSnapshot(roomCode).orElse(null);
        if (room == null) {
            return Optional.empty();
        }

        RoomMutation mutation;
        synchronized (roomLock(roomCode)) {
            if (room.status != RoomStatus.LOBBY) {
                throw new IllegalStateException("Game already started");
            }
            if (!Objects.equals(room.hostPlayerId, hostPlayerId)) {
                throw new IllegalStateException("Only the host can start the game");
            }
            roomMetadataStore.updateRoomStatus(roomCode, RoomStatus.IN_GAME);
            mutation = RoomMutation.updated(roomSnapshot(roomCode).orElseThrow(), null);
        }

        refreshPlayers(roomCode);
        return Optional.of(mutation);
    }

    public Optional<RoomMutation> resetRoomToLobby(String roomCode) {
        RoomSnapshot room = roomSnapshot(roomCode).orElse(null);
        if (room == null) {
            return Optional.empty();
        }

        RoomMutation mutation;
        synchronized (roomLock(roomCode)) {
            roomMetadataStore.updateRoomStatus(roomCode, RoomStatus.LOBBY);
            mutation = RoomMutation.updated(roomSnapshot(roomCode).orElseThrow(), null);
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
        casinoValueMapsByRoom.put(roomCode, new ConcurrentHashMap<>(valueMap));
    }

    public Optional<Map<String, List<Integer>>> casinoValueMap(String roomCode) {
        Map<String, List<Integer>> valueMap = casinoValueMapsByRoom.get(roomCode);
        if (valueMap == null) {
            return Optional.empty();
        }
        Map<String, List<Integer>> copy = new ConcurrentHashMap<>();
        valueMap.forEach((card, values) -> copy.put(card, List.copyOf(values)));
        return Optional.of(copy);
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
        RoomSnapshot room = roomSnapshot(roomCode).orElse(null);
        if (room == null) {
            removeSessionsForPlayer(roomCode, playerId);
            return Optional.empty();
        }

        RoomMutation mutation;
        boolean resetKrigState = false;
        synchronized (roomLock(roomCode)) {
            RoomSnapshot current = roomSnapshot(roomCode).orElse(null);
            if (current == null) {
                removeSessionsForPlayer(roomCode, playerId);
                return Optional.empty();
            }
            int participantIndex = findParticipantIndex(current.participants, playerId);
            if (participantIndex < 0) {
                removeSessionsForPlayer(roomCode, playerId);
                return Optional.empty();
            }
            roomMetadataStore.removeParticipant(roomCode, playerId);

            removeSessionsForPlayer(roomCode, playerId);

            RoomSnapshot updated = roomSnapshot(roomCode).orElseThrow();
            if (updated.participants.isEmpty()) {
                roomMetadataStore.deleteRoom(roomCode);
                clearRoomResources(roomCode);
                mutation = RoomMutation.deleted(roomCode, playerId);
            } else {
                if (Objects.equals(updated.hostPlayerId, playerId)) {
                    roomMetadataStore.updateRoomHost(roomCode, updated.participants.getFirst().playerId());
                }
                RoomSnapshot next = roomSnapshot(roomCode).orElseThrow();
                if (next.status == RoomStatus.IN_GAME && "krig".equals(normalizeGameType(next.selectedGame)) && next.participants.size() < 2) {
                    roomMetadataStore.updateRoomStatus(roomCode, RoomStatus.LOBBY);
                    resetKrigState = true;
                }
                mutation = RoomMutation.updated(roomSnapshot(roomCode).orElseThrow(), playerId);
            }
        }

        if (!mutation.deleted()) {
            if (resetKrigState) {
                krigStatesByRoom.remove(roomCode);
            }
            refreshPlayers(roomCode);
        }
        return Optional.of(mutation);
    }

    private GameLoopService.RoomState enrichState(String roomCode, GameLoopService.RoomState state) {
        ObjectNode publicState = state.publicState().deepCopy();
        publicState.put("roomCode", roomCode);

        ArrayNode players = JsonNodeFactory.instance.arrayNode();
        RoomSnapshot room = roomSnapshot(roomCode).orElse(null);
        if (room == null) {
            publicState.set("players", players);
            publicState.putNull("hostPlayerId");
            publicState.put("selectedGame", DEFAULT_GAME_TYPE);
            publicState.put("status", RoomStatus.LOBBY.name());
            publicState.put("isPrivate", false);
            return state.withPublicState(publicState);
        }

        room.participants.forEach(player -> {
            ObjectNode playerState = JsonNodeFactory.instance.objectNode();
            playerState.put("playerId", player.playerId());
            if (player.username() == null) {
                playerState.putNull("username");
            } else {
                playerState.put("username", player.username());
            }
            players.add(playerState);
        });
        publicState.set("players", players);
        if (blank(room.hostPlayerId)) {
            publicState.putNull("hostPlayerId");
        } else {
            publicState.put("hostPlayerId", room.hostPlayerId);
        }
        publicState.put("selectedGame", room.selectedGame);
        publicState.put("status", room.status.name());
        publicState.put("isPrivate", room.isPrivate);
        return state.withPublicState(publicState);
    }

    private RoomSummary toSummary(RoomMetadataStore.StoredRoom room) {
        return new RoomSummary(
                room.roomCode(),
                room.hostPlayerId(),
                room.selectedGame(),
                room.status().name(),
                room.participants().size(),
                List.copyOf(room.participants())
        );
    }

    private RoomSnapshot toSnapshot(RoomMetadataStore.StoredRoom room) {
        return new RoomSnapshot(
                room.roomCode(),
                room.hostPlayerId(),
                room.isPrivate(),
                room.selectedGame(),
                room.status(),
                List.copyOf(room.participants())
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
        roomLocks.remove(roomCode);
    }

    private void clearGameStates(String roomCode) {
        highCardStatesByRoom.remove(roomCode);
        krigStatesByRoom.remove(roomCode);
        casinoStatesByRoom.remove(roomCode);
        casinoValueMapsByRoom.remove(roomCode);
    }

    private int findParticipantIndex(List<PlayerSummary> participants, String playerId) {
        for (int index = 0; index < participants.size(); index += 1) {
            if (Objects.equals(participants.get(index).playerId(), playerId)) {
                return index;
            }
        }
        return -1;
    }

    private String normalizeGameType(String gameType) {
        return gameCatalogService.normalize(gameType);
    }

    private int maxPlayersFor(String gameType) {
        return gameCatalogService.maxPlayers(gameType);
    }

    private String normalizeUsername(String username) {
        if (blank(username)) {
            return null;
        }
        return username.trim();
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

    public record PlayerSummary(String playerId, String username) {
    }

    public record RoomSummary(
            String roomCode,
            String hostPlayerId,
            String selectedGame,
            String status,
            int playerCount,
            List<PlayerSummary> participants
    ) {
        public List<String> participantIds() {
            return participants.stream().map(PlayerSummary::playerId).toList();
        }
    }

    public record RoomSnapshot(
            String roomCode,
            String hostPlayerId,
            boolean isPrivate,
            String selectedGame,
            RoomStatus status,
            List<PlayerSummary> participants
    ) {
        public List<String> participantIds() {
            return participants.stream().map(PlayerSummary::playerId).toList();
        }
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

    private Object roomLock(String roomCode) {
        return roomLocks.computeIfAbsent(roomCode, key -> new Object());
    }
}
