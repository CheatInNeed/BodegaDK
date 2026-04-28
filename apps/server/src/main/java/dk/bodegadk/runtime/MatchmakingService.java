package dk.bodegadk.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.time.Duration;
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
    private final ConcurrentMap<String, Object> queueLocks = new ConcurrentHashMap<>();

    public MatchmakingService(
            RoomMetadataStore roomMetadataStore,
            InMemoryRuntimeStore runtimeStore,
            GameLoopService gameLoopService,
            GameCatalogService gameCatalogService,
            ObjectMapper objectMapper
    ) {
        this.roomMetadataStore = roomMetadataStore;
        this.runtimeStore = runtimeStore;
        this.gameLoopService = gameLoopService;
        this.gameCatalogService = gameCatalogService;
        this.objectMapper = objectMapper;
    }

    public MatchmakingSnapshot enqueue(String gameType, String userId, String username, String clientSessionId) {
        GameCatalogService.GameDefinition definition = gameCatalogService.require(gameType);
        if (!definition.quickPlayEnabled() || !definition.realtimeSupported()) {
            throw new IllegalStateException("Quick play is not available for " + gameType);
        }

        UUID ticketId = roomMetadataStore.enqueueTicket(
                definition.id(),
                userId,
                username,
                clientSessionId,
                definition.minPlayers(),
                definition.maxPlayers(),
                definition.strictCount()
        );

        attemptMatch(definition.id());
        return ticketStatus(ticketId).orElseThrow();
    }

    public Optional<MatchmakingSnapshot> ticketStatus(UUID ticketId) {
        Optional<RoomMetadataStore.MatchmakingTicket> ticket = roomMetadataStore.ticket(ticketId);
        ticket.ifPresent(value -> attemptMatch(value.gameType()));
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

    private void attemptMatch(String gameType) {
        synchronized (queueLock(gameType)) {
            GameCatalogService.GameDefinition definition = gameCatalogService.require(gameType);
            List<RoomMetadataStore.MatchmakingTicket> waitingTickets = roomMetadataStore.waitingTickets(definition.id());
            int matchSize = gameCatalogService.resolveMatchSize(definition.id(), waitingTickets.size());
            if (matchSize == 0) {
                return;
            }

            List<RoomMetadataStore.MatchmakingTicket> matchedTickets = uniquePlayerTickets(waitingTickets, matchSize);
            if (matchedTickets.size() < matchSize) {
                return;
            }
            RoomMetadataStore.MatchmakingTicket hostTicket = matchedTickets.getFirst();
            String roomCode = runtimeStore.createRoom(definition.id(), false, hostTicket.userId());
            roomMetadataStore.createRoom(roomCode, hostTicket.userId(), RoomMetadataStore.RoomVisibility.PUBLIC, definition.id(), InMemoryRuntimeStore.RoomStatus.LOBBY);

            for (RoomMetadataStore.MatchmakingTicket ticket : matchedTickets) {
                runtimeStore.joinRoom(roomCode, ticket.userId(), ticket.username(), runtimeToken(roomCode, ticket.userId()));
                roomMetadataStore.upsertParticipant(roomCode, ticket.userId(), ticket.username());
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
            matchedTickets.forEach(ticket -> roomMetadataStore.markTicketMatched(ticket.ticketId(), roomCode));
        }
    }

    private MatchmakingSnapshot toSnapshot(RoomMetadataStore.MatchmakingTicket ticket) {
        int queuedPlayers = roomMetadataStore.waitingTickets(ticket.gameType()).size();
        int playersNeeded = ticket.status() == RoomMetadataStore.MatchmakingTicketStatus.MATCHED
                ? 0
                : Math.max(ticket.minPlayers() - queuedPlayers, 0);
        long estimatedWaitSeconds = ticket.status() == RoomMetadataStore.MatchmakingTicketStatus.MATCHED
                ? 0
                : playersNeeded * ESTIMATED_WAIT_SECONDS_PER_PLAYER;

        return new MatchmakingSnapshot(
                ticket.ticketId(),
                ticket.gameType(),
                ticket.status(),
                ticket.roomCode(),
                ticket.userId(),
                ticket.clientSessionId(),
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

    private List<RoomMetadataStore.MatchmakingTicket> uniquePlayerTickets(List<RoomMetadataStore.MatchmakingTicket> tickets, int limit) {
        List<RoomMetadataStore.MatchmakingTicket> uniqueTickets = new ArrayList<>();
        Set<String> playerIds = new HashSet<>();
        for (RoomMetadataStore.MatchmakingTicket ticket : tickets) {
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
            RoomMetadataStore.MatchmakingTicketStatus status,
            String roomCode,
            String playerId,
            String token,
            int queuedPlayers,
            int playersNeeded,
            int minPlayers,
            int maxPlayers,
            boolean strictCount,
            long estimatedWaitSeconds
    ) {
    }
}
