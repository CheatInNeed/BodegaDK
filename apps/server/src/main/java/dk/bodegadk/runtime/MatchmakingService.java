package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dk.bodegadk.match.MatchMode;
import dk.bodegadk.rating.PlayerGameRating;
import dk.bodegadk.rating.RatingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class MatchmakingService {
    private static final long ESTIMATED_WAIT_SECONDS_PER_PLAYER = 12L;

    private final RoomMetadataStore roomMetadataStore;
    private final InMemoryRuntimeStore runtimeStore;
    private final GameLoopService gameLoopService;
    private final GameCatalogService gameCatalogService;
    private final ObjectMapper objectMapper;
    private final RatingRepository ratingRepository;
    private final MatchmakingWindow matchmakingWindow;
    private final ConcurrentMap<String, Object> queueLocks = new ConcurrentHashMap<>();

    public MatchmakingService(
            RoomMetadataStore roomMetadataStore,
            InMemoryRuntimeStore runtimeStore,
            GameLoopService gameLoopService,
            GameCatalogService gameCatalogService,
            ObjectMapper objectMapper
    ) {
        this(roomMetadataStore, runtimeStore, gameLoopService, gameCatalogService, objectMapper, null,
                new MatchmakingWindow(100, 50, 500));
    }

    @Autowired
    public MatchmakingService(
            RoomMetadataStore roomMetadataStore,
            InMemoryRuntimeStore runtimeStore,
            GameLoopService gameLoopService,
            GameCatalogService gameCatalogService,
            ObjectMapper objectMapper,
            RatingRepository ratingRepository,
            MatchmakingProperties properties
    ) {
        this(roomMetadataStore, runtimeStore, gameLoopService, gameCatalogService, objectMapper,
                ratingRepository, properties.window());
    }

    private MatchmakingService(
            RoomMetadataStore roomMetadataStore,
            InMemoryRuntimeStore runtimeStore,
            GameLoopService gameLoopService,
            GameCatalogService gameCatalogService,
            ObjectMapper objectMapper,
            RatingRepository ratingRepository,
            MatchmakingWindow matchmakingWindow
    ) {
        this.roomMetadataStore = roomMetadataStore;
        this.runtimeStore = runtimeStore;
        this.gameLoopService = gameLoopService;
        this.gameCatalogService = gameCatalogService;
        this.objectMapper = objectMapper;
        this.ratingRepository = ratingRepository;
        this.matchmakingWindow = matchmakingWindow;
    }

    @Transactional
    public MatchmakingSnapshot enqueue(String gameType, String userId, String username, String clientSessionId) {
        return enqueue(gameType, MatchMode.UNRANKED, userId, username, clientSessionId);
    }

    @Transactional
    public MatchmakingSnapshot enqueue(String gameType, MatchMode mode, String userId, String username, String clientSessionId) {
        GameCatalogService.GameDefinition definition = gameCatalogService.require(gameType);
        if (!definition.quickPlayEnabled() || !definition.realtimeSupported()) {
            throw new IllegalStateException("Quick play is not available for " + gameType);
        }

        Integer rating = null;
        if (ratingRepository != null) {
            rating = mode == MatchMode.RANKED
                    ? ratingRepository.findOrCreate(userId, definition.id()).rating()
                    : ratingRepository.find(userId, definition.id()).map(PlayerGameRating::rating).orElse(null);
        }
        UUID ticketId = roomMetadataStore.enqueueTicket(
                definition.id(),
                userId,
                username,
                clientSessionId,
                definition.minPlayers(),
                definition.maxPlayers(),
                definition.strictCount(),
                mode.name(),
                rating
        );

        attemptMatch(definition.id(), mode.name());
        return ticketStatus(ticketId).orElseThrow();
    }

    @Transactional
    public Optional<MatchmakingSnapshot> ticketStatus(UUID ticketId) {
        Optional<RoomMetadataStore.MatchmakingTicket> ticket = roomMetadataStore.ticket(ticketId);
        ticket.ifPresent(value -> attemptMatch(value.gameType(), value.mode()));
        return roomMetadataStore.ticket(ticketId).map(this::toSnapshot);
    }

    public boolean cancel(UUID ticketId) {
        Optional<RoomMetadataStore.MatchmakingTicket> ticket = roomMetadataStore.ticket(ticketId);
        if (ticket.isEmpty()) {
            return false;
        }
        roomMetadataStore.cancelTicket(ticketId);
        return true;
    }

    @Scheduled(fixedDelayString = "${bodegadk.matchmaking.poll-interval-ms:1000}")
    public void processWaitingQueues() {
        for (String gameType : gameCatalogService.gameTypes()) {
            for (MatchMode mode : MatchMode.values()) {
                attemptMatch(gameType, mode.name());
            }
        }
    }

    private void attemptMatch(String gameType, String mode) {
        synchronized (queueLock(gameType + ":" + mode)) {
            GameCatalogService.GameDefinition definition = gameCatalogService.require(gameType);
            List<RoomMetadataStore.MatchmakingTicket> waitingTickets = roomMetadataStore.waitingTickets(definition.id()).stream()
                    .filter(ticket -> ticket.mode().equals(mode))
                    .toList();
            int matchSize = gameCatalogService.resolveMatchSize(definition.id(), waitingTickets.size());
            if (matchSize == 0) {
                return;
            }

            List<RoomMetadataStore.MatchmakingTicket> matchedTickets = uniquePlayerTickets(
                    waitingTickets, matchSize, MatchMode.valueOf(mode)
            );
            if (matchedTickets.size() < matchSize) {
                return;
            }
            RoomMetadataStore.MatchmakingTicket hostTicket = matchedTickets.getFirst();
            String roomCode;
            do {
                roomCode = runtimeStore.generateRoomCode();
            } while (roomMetadataStore.roomExists(roomCode));
            roomMetadataStore.createRoom(roomCode, hostTicket.userId(), RoomMetadataStore.RoomVisibility.PUBLIC, definition.id(), InMemoryRuntimeStore.RoomStatus.LOBBY);
            roomMetadataStore.updateRoomMode(roomCode, mode);
            runtimeStore.mirrorRoom(roomCode, definition.id(), false, hostTicket.userId(), InMemoryRuntimeStore.RoomStatus.LOBBY);

            for (RoomMetadataStore.MatchmakingTicket ticket : matchedTickets) {
                roomMetadataStore.upsertParticipant(roomCode, ticket.userId(), ticket.username());
                runtimeStore.joinRoom(roomCode, ticket.userId(), ticket.username(), runtimeToken(roomCode, ticket.userId()));
            }

            ObjectNode payload = objectMapper.createObjectNode();
            GameLoopService.LoopResult startResult = gameLoopService.handleAction(new GameLoopService.ActionCommand(
                    roomCode,
                    hostTicket.userId(),
                    "START_GAME",
                    payload,
                    UUID.randomUUID().toString(),
                    Instant.now()
            ));

            if (startResult.isError()) {
                runtimeStore.resetRoomToLobby(roomCode);
                roomMetadataStore.updateRoomStatus(roomCode, InMemoryRuntimeStore.RoomStatus.LOBBY);
                throw new IllegalStateException(startResult.errorMessage());
            }

            roomMetadataStore.updateRoomStatus(roomCode, InMemoryRuntimeStore.RoomStatus.IN_GAME);
            for (RoomMetadataStore.MatchmakingTicket ticket : matchedTickets) {
                roomMetadataStore.markTicketMatched(ticket.ticketId(), roomCode);
            }
        }
    }

    private MatchmakingSnapshot toSnapshot(RoomMetadataStore.MatchmakingTicket ticket) {
        int queuedPlayers = (int) roomMetadataStore.waitingTickets(ticket.gameType()).stream()
                .filter(value -> value.mode().equals(ticket.mode()))
                .count();
        int playersNeeded = ticket.status() == RoomMetadataStore.MatchmakingTicketStatus.MATCHED
                ? 0
                : Math.max(ticket.minPlayers() - queuedPlayers, 0);
        long estimatedWaitSeconds = ticket.status() == RoomMetadataStore.MatchmakingTicketStatus.MATCHED
                ? 0
                : playersNeeded * ESTIMATED_WAIT_SECONDS_PER_PLAYER;

        return new MatchmakingSnapshot(
                ticket.ticketId(),
                ticket.gameType(),
                ticket.mode(),
                ticket.status(),
                ticket.roomCode(),
                ticket.userId(),
                queuedPlayers,
                playersNeeded,
                ticket.minPlayers(),
                ticket.maxPlayers(),
                ticket.strictCount(),
                estimatedWaitSeconds
        );
    }

    private Object queueLock(String gameType) {
        return queueLocks.computeIfAbsent(gameType, key -> new Object());
    }

    private List<RoomMetadataStore.MatchmakingTicket> uniquePlayerTickets(
            List<RoomMetadataStore.MatchmakingTicket> tickets, int limit, MatchMode mode
    ) {
        List<RoomMetadataStore.MatchmakingTicket> uniqueTickets = new ArrayList<>();
        Set<String> playerIds = new HashSet<>();
        RoomMetadataStore.MatchmakingTicket anchor = tickets.stream()
                .filter(ticket -> ticket.mode().equals(mode.name()))
                .findFirst()
                .orElse(null);
        Instant now = Instant.now();
        for (RoomMetadataStore.MatchmakingTicket ticket : tickets) {
            if (!ticket.mode().equals(mode.name())) {
                continue;
            }
            if (anchor != null && anchor.rating() != null
                    && ticket.rating() != null
                    && Math.abs(ticket.rating() - anchor.rating()) >
                    matchmakingWindow.forJoinedAt(ticket.createdAt(), now)) {
                continue;
            }
            if (!playerIds.add(ticket.userId())) {
                continue;
            }
            uniqueTickets.add(ticket);
            if (uniqueTickets.size() == limit) {
                break;
            }
        }
        return uniqueTickets;
    }

    public static String runtimeToken(String roomCode, String userId) {
        return roomCode + ":" + userId;
    }

    public record MatchmakingSnapshot(
            UUID ticketId,
            String gameType,
            String mode,
            RoomMetadataStore.MatchmakingTicketStatus status,
            String roomCode,
            String playerId,
            int queuedPlayers,
            int playersNeeded,
            int minPlayers,
            int maxPlayers,
            boolean strictCount,
            long estimatedWaitSeconds
    ) {
    }
}
