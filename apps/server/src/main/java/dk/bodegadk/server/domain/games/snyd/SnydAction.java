package dk.bodegadk.server.domain.games.snyd;

import dk.bodegadk.server.domain.engine.GameAction;

import java.util.List;

/**
 * All possible player actions in Snyd.
 */
public abstract class SnydAction extends GameAction {

    protected SnydAction(String playerId) {
        super(playerId);
    }

    /** Play face-down cards and claim a rank. */
    public static class PlayCards extends SnydAction {
        private final List<String> cardCodes;
        private final String claimRank;

        public PlayCards(String playerId, List<String> cardCodes, String claimRank) {
            super(playerId);
            this.cardCodes = List.copyOf(cardCodes);
            this.claimRank = claimRank;
        }

        public List<String> cardCodes() { return cardCodes; }
        public String claimRank()       { return claimRank; }
    }

    /** Challenge the last claim. */
    public static class CallSnyd extends SnydAction {
        public CallSnyd(String playerId) {
            super(playerId);
        }
    }
}

