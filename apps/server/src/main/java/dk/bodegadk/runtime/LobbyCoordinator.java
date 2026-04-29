package dk.bodegadk.runtime;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class LobbyCoordinator {
    private static final String SELECT_GAME = "SELECT_GAME";

    private final InMemoryRuntimeStore runtimeStore;
    private final GameCatalogService gameCatalogService;
    private final RoomMetadataStore roomMetadataStore;

    public LobbyCoordinator(InMemoryRuntimeStore runtimeStore, GameCatalogService gameCatalogService, RoomMetadataStore roomMetadataStore) {
        this.runtimeStore = runtimeStore;
        this.gameCatalogService = gameCatalogService;
        this.roomMetadataStore = roomMetadataStore;
    }

    public boolean supports(GameLoopService.ActionCommand command) {
        return SELECT_GAME.equals(command.type());
    }

    public GameLoopService.LoopResult handle(GameLoopService.ActionCommand command) {
        if (!runtimeStore.isParticipant(command.roomCode(), command.playerId())) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }

        InMemoryRuntimeStore.RoomSnapshot room = runtimeStore.roomSnapshot(command.roomCode()).orElse(null);
        if (room == null) {
            return GameLoopService.LoopResult.error("SESSION_NOT_READY: session validation unavailable");
        }
        if (room.status() != InMemoryRuntimeStore.RoomStatus.LOBBY) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: Cannot change game after match start");
        }

        String requestedGame = gameCatalogService.normalize(command.payloadRaw().path("game").asText(""));
        GameCatalogService.GameDefinition definition = gameCatalogService.find(requestedGame).orElse(null);
        if (definition == null || !definition.lobbyEnabled()) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: Unsupported lobby game: " + requestedGame);
        }

        try {
            runtimeStore.selectGame(command.roomCode(), command.playerId(), definition.id())
                    .orElseThrow(() -> new IllegalStateException("Room not found"));
            roomMetadataStore.updateRoomGameType(command.roomCode(), definition.id());
        } catch (IllegalStateException exception) {
            return GameLoopService.LoopResult.error("RULES_NOT_AVAILABLE: " + exception.getMessage());
        }

        GameLoopService.RoomState nextState = runtimeStore.refreshPlayers(command.roomCode());
        return GameLoopService.LoopResult.success(nextState, nextState.publicState(), Map.of(), false, null);
    }
}
