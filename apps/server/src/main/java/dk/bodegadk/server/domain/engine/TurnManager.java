package dk.bodegadk.server.domain.engine;

import java.util.List;

/**
 * Circular turn order utility with direction reversal and skip support.
 * Used by games that need custom turn logic (Uno-style reverse, skip, etc.).
 *
 * <p>Games with simple "next player" turns can just use {@link GameState#advanceTurn()} instead.
 */
public final class TurnManager {

    private final List<String> playerIds;
    private int currentIndex;
    private int direction; // +1 = clockwise, -1 = counter-clockwise

    public TurnManager(List<String> playerIds) {
        this(playerIds, 0);
    }

    public TurnManager(List<String> playerIds, int startIndex) {
        this.playerIds = List.copyOf(playerIds);
        this.currentIndex = startIndex;
        this.direction = 1;
    }

    /** Copy constructor. */
    public TurnManager(TurnManager other) {
        this.playerIds = other.playerIds; // already immutable
        this.currentIndex = other.currentIndex;
        this.direction = other.direction;
    }

    public String current() {
        return playerIds.get(currentIndex);
    }

    public String peekNext() {
        return playerIds.get(nextIndex());
    }

    /** Advance to the next player. Returns the new current player ID. */
    public String advance() {
        currentIndex = nextIndex();
        return current();
    }

    /** Skip N players ahead. Returns the new current player ID. */
    public String skip(int count) {
        for (int i = 0; i < count; i++) {
            currentIndex = nextIndex();
        }
        return current();
    }

    /** Set turn to a specific player by ID. */
    public void setTo(String playerId) {
        int idx = playerIds.indexOf(playerId);
        if (idx < 0) throw new IllegalArgumentException("Player not found: " + playerId);
        currentIndex = idx;
    }

    /** Reverse direction (clockwise ↔ counter-clockwise). */
    public void reverse() {
        direction *= -1;
    }

    public int direction()             { return direction; }
    public List<String> playerIds()    { return playerIds; }

    private int nextIndex() {
        return Math.floorMod(currentIndex + direction, playerIds.size());
    }
}

