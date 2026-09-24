package dk.bodegadk.server.domain.games.fem;

import dk.bodegadk.server.domain.engine.GameAction;

import java.util.List;

/**
 * All possible player actions in Danish 500 (Femhundrede).
 */
public abstract class FemAction extends GameAction {

    protected FemAction(String playerId) {
        super(playerId);
    }

    /** Draw the top card from the stock pile. */
    public static class DrawFromStock extends FemAction {
        public DrawFromStock(String playerId) {
            super(playerId);
        }
    }

    /** Take the top card from the discard pile. */
    public static class DrawFromDiscard extends FemAction {
        public DrawFromDiscard(String playerId) {
            super(playerId);
        }
    }

    /** Take the entire discard pile. */
    public static class TakeDiscardPile extends FemAction {
        public TakeDiscardPile(String playerId) {
            super(playerId);
        }
    }

    /** Place a new meld of 3+ consecutive same-suit cards. */
    public static class LayMeld extends FemAction {
        private final List<String> cardCodes;

        public LayMeld(String playerId, List<String> cardCodes) {
            super(playerId);
            this.cardCodes = List.copyOf(cardCodes);
        }

        public List<String> cardCodes() { return cardCodes; }
    }

    /** Add a card to an existing meld. */
    public static class ExtendMeld extends FemAction {
        private final String meldId;
        private final String cardCode;

        public ExtendMeld(String playerId, String meldId, String cardCode) {
            super(playerId);
            this.meldId = meldId;
            this.cardCode = cardCode;
        }

        public String meldId() { return meldId; }
        public String cardCode() { return cardCode; }
    }

    /** Discard one card to end the turn. */
    public static class Discard extends FemAction {
        private final String cardCode;

        public Discard(String playerId, String cardCode) {
            super(playerId);
            this.cardCode = cardCode;
        }

        public String cardCode() { return cardCode; }
    }
}
