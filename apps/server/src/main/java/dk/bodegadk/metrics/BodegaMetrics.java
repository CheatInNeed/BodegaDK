package dk.bodegadk.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Set;

/**
 * BodegaDK's own business metrics, exported to Prometheus via {@code /actuator/prometheus}
 * (names become e.g. {@code bodegadk_game_action_seconds_count}).
 *
 * <p>Tags must have a small, fixed set of values. Never tag with room codes or user IDs: every new
 * value creates a new time series and makes Prometheus slow. Use logs for per-room detail.
 */
@Component
public class BodegaMetrics {
    public static final String OUTCOME_OK = "ok";
    public static final String OUTCOME_REJECTED = "rejected";
    public static final String OUTCOME_CRASH = "crash";

    // Anything outside this set is reported as "other", so a bad client value cannot create new series.
    private static final Set<String> KNOWN_GAMES = Set.of("snyd", "highcard", "casino", "fem", "krig");

    private final MeterRegistry registry;
    private final Counter heartbeatTimeouts;
    private final Counter matchHistoryFailures;

    public BodegaMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.heartbeatTimeouts = Counter.builder("bodegadk.heartbeat.timeouts")
                .description("Players dropped because their heartbeat stopped")
                .register(registry);
        this.matchHistoryFailures = Counter.builder("bodegadk.match.history.failures")
                .description("Finished games whose result could not be saved")
                .register(registry);
    }

    public Timer.Sample startTimer() {
        return Timer.start(registry);
    }

    /** Records one game action: how long it took and whether it succeeded, was rejected by the rules, or crashed. */
    public void recordGameAction(Timer.Sample sample, String game, String outcome) {
        sample.stop(Timer.builder("bodegadk.game.action")
                .description("Game actions handled by the room workers")
                .tag("game", game(game))
                .tag("outcome", outcome)
                .register(registry));
    }

    public void gameStarted(String game) {
        counter("bodegadk.games.started", "Games started", "game", game(game)).increment();
    }

    public void gameFinished(String game) {
        counter("bodegadk.games.finished", "Games finished", "game", game(game)).increment();
    }

    /** @param reason a fixed code chosen by the server, e.g. {@code invalid_token}; never client input */
    public void connectRejected(String reason) {
        counter("bodegadk.ws.connect.rejected", "WebSocket CONNECT attempts that were refused", "reason", reason).increment();
    }

    public void heartbeatTimeout() {
        heartbeatTimeouts.increment();
    }

    public void matchHistoryFailure() {
        matchHistoryFailures.increment();
    }

    /** @param outcome {@code sent}, {@code failed} or {@code expired} */
    public void push(String outcome) {
        counter("bodegadk.push", "Web push notification attempts", "outcome", outcome).increment();
    }

    private Counter counter(String name, String description, String tagKey, String tagValue) {
        // Micrometer returns the existing counter when name + tags match, so this does not create duplicates.
        return Counter.builder(name).description(description).tag(tagKey, tagValue).register(registry);
    }

    static String game(String game) {
        if (game == null) {
            return "other";
        }
        String normalized = game.toLowerCase(Locale.ROOT);
        return KNOWN_GAMES.contains(normalized) ? normalized : "other";
    }
}
