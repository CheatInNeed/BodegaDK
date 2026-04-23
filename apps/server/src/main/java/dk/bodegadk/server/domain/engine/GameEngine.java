package dk.bodegadk.server.domain.engine;

import java.util.List;

/**
 * <p>Every game (Snyd, Meyer, Fem, etc.) implements this with its own state and action types.
 *
 * <p>Usage:
 * <pre>
 *   S state = engine.init(playerIds);
 *   engine.validate(action, state);     // throws GameRuleException if illegal
 *   S next  = engine.apply(action, state); // returns NEW state, does not mutate input
 * </pre>
 *
 * @param <S> concrete GameState subclass
 * @param <A> concrete GameAction subclass
 */
public interface GameEngine<S extends GameState, A extends GameAction> {

    /** Unique game identifier, e.g. "snyd", "meyer", "fem". */
    String gameId();

    /** Minimum number of players required to start. */
    int minPlayers();

    /** Maximum number of players allowed. */
    int maxPlayers();

    /** Create initial game state: shuffle, deal, set first turn. */
    S init(List<String> playerIds);

    /**
     * Validate whether an action is legal in the current state.
     * @throws GameRuleException if the action is not allowed
     */
    void validate(A action, S state) throws GameRuleException;

    /**
     * Apply a validated action. Returns a NEW state — does not mutate the input.
     * @throws GameRuleException if the action is not allowed
     */
    S apply(A action, S state);

    /** Check if the game has ended. */
    boolean isFinished(S state);

    /** Get the winner's player ID, or null if not finished / draw. */
    String getWinner(S state);

    /**
     * Exception for rule violations. The server layer catches this
     * and sends it as an ERROR message to the client.
     */
    class GameRuleException extends RuntimeException {
        public GameRuleException(String message) {
            super(message);
        }
    }
}

