package dk.bodegadk.runtime;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MatchmakingWindowTest {
    @Test
    void widensEveryTenSecondsAndStopsAtMaximum() {
        MatchmakingWindow window = new MatchmakingWindow(100, 50, 250);

        assertEquals(100, window.forWait(Duration.ofSeconds(9)));
        assertEquals(150, window.forWait(Duration.ofSeconds(10)));
        assertEquals(200, window.forWait(Duration.ofSeconds(20)));
        assertEquals(250, window.forWait(Duration.ofSeconds(90)));
    }
}
