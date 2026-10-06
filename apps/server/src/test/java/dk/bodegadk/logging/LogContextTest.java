package dk.bodegadk.logging;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class LogContextTest {

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void setsTagsAndRemovesThemOnClose() {
        try (LogContext ignored = LogContext.open().with(LogContext.ROOM_CODE, "ABCD").with(LogContext.PLAYER_ID, "p1")) {
            assertEquals("ABCD", MDC.get(LogContext.ROOM_CODE));
            assertEquals("p1", MDC.get(LogContext.PLAYER_ID));
        }

        assertNull(MDC.get(LogContext.ROOM_CODE));
        assertNull(MDC.get(LogContext.PLAYER_ID));
    }

    @Test
    void nestedContextRestoresOuterValues() {
        try (LogContext outer = LogContext.open().with(LogContext.ROOM_CODE, "OUTER")) {
            try (LogContext inner = LogContext.open().with(LogContext.ROOM_CODE, "INNER")) {
                assertEquals("INNER", MDC.get(LogContext.ROOM_CODE));
            }
            assertEquals("OUTER", MDC.get(LogContext.ROOM_CODE));
        }
        assertNull(MDC.get(LogContext.ROOM_CODE));
    }

    @Test
    void blankValueRemovesTagForTheContextLifetime() {
        MDC.put(LogContext.PLAYER_ID, "p1");

        try (LogContext ignored = LogContext.open().with(LogContext.PLAYER_ID, " ")) {
            assertNull(MDC.get(LogContext.PLAYER_ID));
        }

        assertEquals("p1", MDC.get(LogContext.PLAYER_ID));
    }

    @Test
    void sanitizeBlocksLogForgingAndLongValues() {
        assertEquals("PLAY_CARDS", LogContext.sanitize("PLAY_CARDS"));
        assertEquals("a?INFO?fake", LogContext.sanitize("a\nINFO fake"));
        assertEquals(64, LogContext.sanitize("x".repeat(500)).length());
        assertNull(LogContext.sanitize(null));
    }
}
