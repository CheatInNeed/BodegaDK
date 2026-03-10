package dk.bodegadk.server.domain.rooms;

import dk.bodegadk.server.domain.engine.GameAction;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.engine.ViewProjector;
import dk.bodegadk.server.domain.games.snyd.SnydAction;
import dk.bodegadk.server.domain.games.snyd.SnydState;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class ActiveGameRegistry {
    private final GameCatalog gameCatalog;
    private final Map<String, RunningGame<?, ?>> activeGames = new ConcurrentHashMap<>();

    public ActiveGameRegistry(GameCatalog gameCatalog) {
        this.gameCatalog = gameCatalog;
    }

    public void start(LobbyRoom room) {
        GameCatalog.GameDefinition<?, ?> definition = gameCatalog.requireDefinition(room.gameId());
        RunningGame<?, ?> runtime = createRuntime(definition, room.players().stream().map(RoomPlayer::playerId).toList());
        activeGames.put(room.roomCode(), runtime);
    }

    public boolean hasGame(String roomCode) {
        return activeGames.containsKey(roomCode);
    }

    public Snapshot connect(String roomCode, String playerId) {
        RunningGame<?, ?> game = requireGame(roomCode);
        return game.snapshot(playerId, roomCode);
    }

    public UpdateResult applyAction(String roomCode, String playerId, String type, Map<String, Object> payload) {
        RunningGame<?, ?> game = requireGame(roomCode);
        return game.apply(playerId, type, payload, roomCode);
    }

    @SuppressWarnings("unchecked")
    private <S extends GameState, A extends GameAction> RunningGame<S, A> createRuntime(
            GameCatalog.GameDefinition<?, ?> rawDefinition,
            List<String> playerIds
    ) {
        GameCatalog.GameDefinition<S, A> definition = (GameCatalog.GameDefinition<S, A>) rawDefinition;
        S initialState = definition.engine().init(playerIds);
        return new RunningGame<>(definition.engine(), definition.viewProjector(), initialState);
    }

    private RunningGame<?, ?> requireGame(String roomCode) {
        RunningGame<?, ?> game = activeGames.get(roomCode);
        if (game == null) {
            throw new RoomService.RoomConflictException("Game has not been started for room " + roomCode);
        }
        return game;
    }

    public record Snapshot(Map<String, Object> publicState, Map<String, Object> privateState) {}

    public record UpdateResult(
            Map<String, Object> publicState,
            Map<String, Map<String, Object>> privateStates,
            String winnerPlayerId
    ) {
    }

    private static final class RunningGame<S extends GameState, A extends GameAction> {
        private final dk.bodegadk.server.domain.engine.GameEngine<S, A> engine;
        private final ViewProjector<S> viewProjector;
        private S state;

        private RunningGame(
                dk.bodegadk.server.domain.engine.GameEngine<S, A> engine,
                ViewProjector<S> viewProjector,
                S state
        ) {
            this.engine = engine;
            this.viewProjector = viewProjector;
            this.state = state;
        }

        private synchronized Snapshot snapshot(String playerId, String roomCode) {
            return new Snapshot(withRoomCode(viewProjector.toPublicView(state), roomCode), viewProjector.toPrivateView(state, playerId));
        }

        private synchronized UpdateResult apply(String playerId, String type, Map<String, Object> payload, String roomCode) {
            A action = toAction(playerId, type, payload);
            state = engine.apply(action, state);

            Map<String, Object> publicState = withRoomCode(viewProjector.toPublicView(state), roomCode);
            Map<String, Map<String, Object>> privateStates = new LinkedHashMap<>();
            for (String targetPlayerId : state.playerIds()) {
                privateStates.put(targetPlayerId, viewProjector.toPrivateView(state, targetPlayerId));
            }

            return new UpdateResult(publicState, privateStates, engine.isFinished(state) ? engine.getWinner(state) : null);
        }

        @SuppressWarnings("unchecked")
        private A toAction(String playerId, String type, Map<String, Object> payload) {
            if (engine.gameId().equals("snyd")) {
                if ("PLAY_CARDS".equals(type)) {
                    Object rawCards = payload.get("cards");
                    Object rawClaimRank = payload.get("claimRank");
                    List<String> cards = rawCards instanceof List<?> list
                            ? list.stream().filter(String.class::isInstance).map(String.class::cast).toList()
                            : List.of();
                    String claimRank = rawClaimRank instanceof String value ? value : "A";
                    return (A) new SnydAction.PlayCards(playerId, cards, claimRank);
                }
                if ("CALL_SNYD".equals(type)) {
                    return (A) new SnydAction.CallSnyd(playerId);
                }
            }

            throw new RoomService.RoomConflictException("Unsupported action type: " + type);
        }

        private Map<String, Object> withRoomCode(Map<String, Object> publicState, String roomCode) {
            Map<String, Object> next = new LinkedHashMap<>(publicState);
            next.put("roomCode", roomCode);
            return next;
        }
    }
}
