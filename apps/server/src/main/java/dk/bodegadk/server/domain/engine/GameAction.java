package dk.bodegadk.server.domain.engine;

/**
 * Base class for all game actions (player intents).
 * Every game-specific action (PlayCards, CallSnyd, RollDice, etc.) extends this.
 */
public abstract class GameAction {

    private final String playerId;

    protected GameAction(String playerId) {
        this.playerId = playerId;
    }

    public String playerId() {
        return playerId;
    }
}

