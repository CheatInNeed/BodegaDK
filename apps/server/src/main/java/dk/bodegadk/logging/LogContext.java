package dk.bodegadk.logging;

import org.slf4j.MDC;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tags every log line written on the current thread with diagnostic fields (SLF4J MDC),
 * e.g. which room and player the work belongs to.
 *
 * <p>Use with try-with-resources. Closing restores whatever values the keys had before,
 * so contexts can be nested and pooled threads never leak tags into unrelated work:
 *
 * <pre>{@code
 * try (LogContext ignored = LogContext.open().with(LogContext.ROOM_CODE, roomCode)) {
 *     log.info("Game started"); // -> "... room=ABCD ... Game started"
 * }
 * }</pre>
 */
public final class LogContext implements AutoCloseable {
    public static final String REQUEST_ID = "requestId";
    public static final String ROOM_CODE = "roomCode";
    public static final String PLAYER_ID = "playerId";
    public static final String WS_SESSION = "wsSession";

    private final Map<String, String> previousValues = new LinkedHashMap<>();

    private LogContext() {
    }

    public static LogContext open() {
        return new LogContext();
    }

    /** Sets {@code key} for the lifetime of this context. A null or blank value removes the key. */
    public LogContext with(String key, String value) {
        if (!previousValues.containsKey(key)) {
            previousValues.put(key, MDC.get(key));
        }
        if (value == null || value.isBlank()) {
            MDC.remove(key);
        } else {
            MDC.put(key, value);
        }
        return this;
    }

    @Override
    public void close() {
        previousValues.forEach((key, previous) -> {
            if (previous == null) {
                MDC.remove(key);
            } else {
                MDC.put(key, previous);
            }
        });
    }

    /**
     * Makes a client-supplied value safe to put in a log line: keeps it short and replaces anything
     * that is not a plain identifier character, so clients cannot forge extra log lines.
     */
    public static String sanitize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.length() > 64 ? value.substring(0, 64) : value;
        return trimmed.replaceAll("[^A-Za-z0-9._:-]", "?");
    }
}
