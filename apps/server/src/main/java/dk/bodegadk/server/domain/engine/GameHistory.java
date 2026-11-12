package dk.bodegadk.server.domain.engine;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Bounded, append-only log of public game events, shown in the client's history tab.
 *
 * <p>Events must only contain information that is already public to every player
 * (never hidden cards). The client turns {@code type} + {@code data} into translated text.
 * The log lives on the game state, so it is cleared whenever a fresh state is created
 * (new game, rematch).
 */
public final class GameHistory {

    public static final int MAX_EVENTS = 100;

    /**
     * @param seq  monotonically increasing per game, stable across the cap
     * @param at   epoch millis when the event was recorded
     * @param type event type, e.g. {@code HIGHCARD_ROUND}
     * @param data event parameters (player ids, card codes, counts)
     */
    public record Event(int seq, long at, String type, Map<String, String> data) {
    }

    private final List<Event> events;
    private int nextSeq;

    public GameHistory() {
        this.events = new ArrayList<>();
        this.nextSeq = 0;
    }

    /** Copy constructor — events are immutable, so a shallow list copy suffices. */
    public GameHistory(GameHistory other) {
        this.events = new ArrayList<>(other.events);
        this.nextSeq = other.nextSeq;
    }

    /** Append an event; {@code data} entries with null values are dropped. */
    public void add(String type, Map<String, ?> data) {
        Map<String, String> clean = new LinkedHashMap<>();
        if (data != null) {
            data.forEach((key, value) -> {
                if (value != null) clean.put(key, value.toString());
            });
        }
        events.add(new Event(nextSeq++, System.currentTimeMillis(), type, Collections.unmodifiableMap(clean)));
        while (events.size() > MAX_EVENTS) {
            events.removeFirst();
        }
    }

    public List<Event> events() {
        return Collections.unmodifiableList(events);
    }
}
