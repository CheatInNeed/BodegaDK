package dk.bodegadk.server.domain.engine;

import java.util.List;

/**
 * Abstract base for all game states.
 * Holds shared lifecycle fields: players, turn index, phase, winner.
 * Subclasses add game-specific fields (hands, pile, dice, scores, etc.).
 *
 * <p>Each subclass must implement {@link #copy()} to support immutable apply.
 */
public abstract class GameState {

    public enum Phase { WAITING, PLAYING, FINISHED }

    private final List<String> playerIds;
    private int currentTurnIndex;
    private Phase phase;
    private String winnerPlayerId;

    protected GameState(List<String> playerIds) {
        this.playerIds = List.copyOf(playerIds);
        this.currentTurnIndex = 0;
        this.phase = Phase.WAITING;
        this.winnerPlayerId = null;
    }

    /** Copy constructor — used by subclass {@code copy()} implementations. */
    protected GameState(GameState other) {
        this.playerIds = other.playerIds;
        this.currentTurnIndex = other.currentTurnIndex;
        this.phase = other.phase;
        this.winnerPlayerId = other.winnerPlayerId;
    }

    /* ── Getters ── */

    public List<String> playerIds()       { return playerIds; }
    public int playerCount()              { return playerIds.size(); }
    public int currentTurnIndex()         { return currentTurnIndex; }
    public Phase phase()                  { return phase; }
    public String winnerPlayerId()        { return winnerPlayerId; }

    public String currentPlayerId() {
        return playerIds.get(currentTurnIndex);
    }

    public String nextPlayerId() {
        return playerIds.get((currentTurnIndex + 1) % playerIds.size());
    }

    public boolean isFinished() {
        return phase == Phase.FINISHED;
    }

    /* ── Setters ── */

    public void setPhase(Phase phase)                { this.phase = phase; }
    public void setWinnerPlayerId(String playerId)   { this.winnerPlayerId = playerId; }

    public void setCurrentTurnIndex(int index) {
        this.currentTurnIndex = index % playerIds.size();
    }

    /** Advance turn to the next player in order. */
    public void advanceTurn() {
        this.currentTurnIndex = (currentTurnIndex + 1) % playerIds.size();
    }

    /** Set turn to a specific player by ID. */
    public void setTurnToPlayer(String playerId) {
        int idx = playerIds.indexOf(playerId);
        if (idx < 0) throw new IllegalArgumentException("Player not in game: " + playerId);
        this.currentTurnIndex = idx;
    }

    /**
     * Deep-copy this state. Required for immutable {@code apply()} pattern.
     * Each game subclass must override this.
     */
    public abstract GameState copy();
}

