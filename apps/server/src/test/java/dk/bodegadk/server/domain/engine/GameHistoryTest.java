package dk.bodegadk.server.domain.engine;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class GameHistoryTest {

    @Test
    void addStringifiesValuesAndDropsNulls() {
        GameHistory history = new GameHistory();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("count", 3);
        data.put("winnerPlayerId", null);

        history.add("TEST", data);

        GameHistory.Event event = history.events().getFirst();
        assertEquals(0, event.seq());
        assertEquals("TEST", event.type());
        assertEquals(Map.of("count", "3"), event.data());
    }

    @Test
    void capsAtMaxEventsKeepingNewestAndSequence() {
        GameHistory history = new GameHistory();
        for (int i = 0; i < GameHistory.MAX_EVENTS + 5; i++) {
            history.add("TEST", Map.of());
        }

        assertEquals(GameHistory.MAX_EVENTS, history.events().size());
        assertEquals(5, history.events().getFirst().seq());
        assertEquals(GameHistory.MAX_EVENTS + 4, history.events().getLast().seq());
    }

    @Test
    void copyIsIndependentOfOriginal() {
        GameHistory original = new GameHistory();
        original.add("A", Map.of());
        GameHistory copy = new GameHistory(original);

        copy.add("B", Map.of());

        assertEquals(1, original.events().size());
        assertEquals(2, copy.events().size());
        assertEquals(1, copy.events().getLast().seq());
    }
}
