package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.GameAction;

public class KrigAction extends GameAction {
    private final String cardCode;

    public KrigAction(String playerId, String cardCode) {
        super(playerId);
        this.cardCode = cardCode;
    }

    public String cardCode() {
        return cardCode;
    }
}
