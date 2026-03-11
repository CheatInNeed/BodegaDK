package dk.bodegadk.server.domain.games.highcard;

import dk.bodegadk.server.domain.engine.GameAction;

/**
 * The only action in High Card: player picks a card from their hand to play.
 */
public class HighCardAction extends GameAction {

    private final String cardCode;

    public HighCardAction(String playerId, String cardCode) {
        super(playerId);
        this.cardCode = cardCode;
    }

    public String cardCode() {
        return cardCode;
    }
}

