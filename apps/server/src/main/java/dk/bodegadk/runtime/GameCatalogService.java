package dk.bodegadk.runtime;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class GameCatalogService {
    private final Map<String, GameDefinition> definitions = new LinkedHashMap<>();

    public GameCatalogService() {
        register(new GameDefinition("highcard", 1, 8, true, true, true, true));
        register(new GameDefinition("krig", 2, 2, true, true, true, true));
        register(new GameDefinition("casino", 2, 2, true, true, true, true));
        register(new GameDefinition("snyd", 2, 6, false, true, true, true));
        register(new GameDefinition("poker", 2, 8, false, false, false, false));
    }

    public Optional<GameDefinition> find(String gameType) {
        return Optional.ofNullable(definitions.get(normalize(gameType)));
    }

    public GameDefinition require(String gameType) {
        return find(gameType).orElseThrow(() -> new IllegalArgumentException("Unsupported game type: " + gameType));
    }

    public boolean supportsRealtime(String gameType) {
        return find(gameType).map(GameDefinition::realtimeSupported).orElse(false);
    }

    public boolean supportsQuickPlay(String gameType) {
        return find(gameType).map(GameDefinition::quickPlayEnabled).orElse(false);
    }

    public int maxPlayers(String gameType) {
        return require(gameType).maxPlayers();
    }

    public int minPlayers(String gameType) {
        return require(gameType).minPlayers();
    }

    public String normalize(String gameType) {
        if (gameType == null || gameType.isBlank()) {
            return "snyd";
        }
        return gameType.trim().toLowerCase(Locale.ROOT);
    }

    public int resolveMatchSize(String gameType, int waitingCount) {
        GameDefinition definition = require(gameType);
        if (waitingCount < definition.minPlayers()) {
            return 0;
        }
        if (definition.strictCount()) {
            return definition.minPlayers();
        }
        return Math.min(waitingCount, definition.maxPlayers());
    }

    private void register(GameDefinition definition) {
        definitions.put(definition.id(), definition);
    }

    public record GameDefinition(
            String id,
            int minPlayers,
            int maxPlayers,
            boolean strictCount,
            boolean lobbyEnabled,
            boolean quickPlayEnabled,
            boolean realtimeSupported
    ) {
    }
}
