package dk.bodegadk.metrics;

import dk.bodegadk.runtime.InMemoryRuntimeStore;
import dk.bodegadk.ws.GameWsHandler;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.stereotype.Component;

/**
 * "Right now" numbers read straight from the in-memory runtime each time Prometheus scrapes
 * (every 15 s), e.g. {@code bodegadk_rooms{status="IN_GAME"}} and {@code bodegadk_ws_sessions}.
 */
@Component
public class RuntimeGaugesBinder implements MeterBinder {
    private final InMemoryRuntimeStore runtimeStore;
    private final GameWsHandler wsHandler;

    public RuntimeGaugesBinder(InMemoryRuntimeStore runtimeStore, GameWsHandler wsHandler) {
        this.runtimeStore = runtimeStore;
        this.wsHandler = wsHandler;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        for (InMemoryRuntimeStore.RoomStatus status : InMemoryRuntimeStore.RoomStatus.values()) {
            Gauge.builder("bodegadk.rooms", runtimeStore, store -> store.countRooms(status))
                    .description("Rooms held in server memory")
                    .tag("status", status.name())
                    .register(registry);
        }
        Gauge.builder("bodegadk.ws.sessions", wsHandler, GameWsHandler::connectedPlayerCount)
                .description("WebSocket connections that completed CONNECT")
                .register(registry);
    }
}
