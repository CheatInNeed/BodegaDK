package dk.bodegadk.server.domain.rooms;

import dk.bodegadk.server.domain.engine.GameAction;
import dk.bodegadk.server.domain.engine.GameEngine;
import dk.bodegadk.server.domain.engine.GameState;
import dk.bodegadk.server.domain.engine.ViewProjector;
import dk.bodegadk.server.domain.games.krig.KrigEngine;
import dk.bodegadk.server.domain.games.krig.KrigViewProjector;
import dk.bodegadk.server.domain.games.snyd.SnydEngine;
import dk.bodegadk.server.domain.games.snyd.SnydState;
import dk.bodegadk.server.domain.games.snyd.SnydViewProjector;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class GameCatalog {
    private final Map<String, GameDefinition<?, ?>> games;

    public GameCatalog() {
        Map<String, GameDefinition<?, ?>> definitions = new LinkedHashMap<>();
        register(definitions, new KrigEngine(), new KrigViewProjector());
        register(definitions, new SnydEngine(), new SnydViewProjector());
        this.games = Map.copyOf(definitions);
    }

    public Collection<GameSummary> list() {
        return games.values().stream()
                .map(definition -> new GameSummary(
                        definition.gameId(),
                        definition.engine().minPlayers(),
                        definition.engine().maxPlayers()
                ))
                .toList();
    }

    public GameSummary requireSummary(String gameId) {
        GameDefinition<?, ?> definition = games.get(normalize(gameId));
        if (definition == null) {
            throw new RoomService.RoomConflictException("Unsupported game: " + gameId);
        }

        return new GameSummary(
                definition.gameId(),
                definition.engine().minPlayers(),
                definition.engine().maxPlayers()
        );
    }

    public GameDefinition<?, ?> requireDefinition(String gameId) {
        GameDefinition<?, ?> definition = games.get(normalize(gameId));
        if (definition == null) {
            throw new RoomService.RoomConflictException("Unsupported game: " + gameId);
        }
        return definition;
    }

    private static String normalize(String gameId) {
        return gameId == null ? "" : gameId.trim().toLowerCase();
    }

    private static <S extends GameState, A extends GameAction> void register(
            Map<String, GameDefinition<?, ?>> definitions,
            GameEngine<S, A> engine,
            ViewProjector<S> viewProjector
    ) {
        definitions.put(engine.gameId(), new GameDefinition<>(engine.gameId(), engine, viewProjector));
    }

    public record GameSummary(String gameId, int minPlayers, int maxPlayers) {}

    public record GameDefinition<S extends GameState, A extends GameAction>(
            String gameId,
            GameEngine<S, A> engine,
            ViewProjector<S> viewProjector
    ) {
    }
}
