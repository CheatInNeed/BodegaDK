package dk.bodegadk.metrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BodegaMetricsTest {
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final BodegaMetrics metrics = new BodegaMetrics(registry);

    @Test
    void gameTagIsLimitedToKnownGames() {
        assertEquals("krig", BodegaMetrics.game("KRIG"));
        assertEquals("fem", BodegaMetrics.game("fem"));
        assertEquals("other", BodegaMetrics.game("anything-a-client-sends"));
        assertEquals("other", BodegaMetrics.game(null));
    }

    @Test
    void recordsGameActionsWithGameAndOutcome() {
        metrics.recordGameAction(metrics.startTimer(), "snyd", BodegaMetrics.OUTCOME_OK);
        metrics.recordGameAction(metrics.startTimer(), "snyd", BodegaMetrics.OUTCOME_OK);
        metrics.recordGameAction(metrics.startTimer(), "krig", BodegaMetrics.OUTCOME_CRASH);

        assertEquals(2, registry.get("bodegadk.game.action").tags("game", "snyd", "outcome", "ok").timer().count());
        assertEquals(1, registry.get("bodegadk.game.action").tags("game", "krig", "outcome", "crash").timer().count());
    }

    @Test
    void repeatedCountersShareOneSeries() {
        metrics.push("sent");
        metrics.push("sent");
        metrics.push("failed");
        metrics.gameStarted("casino");
        metrics.heartbeatTimeout();

        assertEquals(2.0, registry.get("bodegadk.push").tag("outcome", "sent").counter().count());
        assertEquals(1.0, registry.get("bodegadk.push").tag("outcome", "failed").counter().count());
        assertEquals(1.0, registry.get("bodegadk.games.started").tag("game", "casino").counter().count());
        assertEquals(1.0, registry.get("bodegadk.heartbeat.timeouts").counter().count());
    }
}
