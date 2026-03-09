package dk.bodegadk.server.domain.games.highcard;

import dk.bodegadk.server.domain.engine.ViewProjector;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Maps HighCardState into protocol-compatible public/private views.
 */
public class HighCardViewProjector implements ViewProjector<HighCardState> {

    @Override
    public Map<String, Object> toPublicView(HighCardState state) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("round", state.round());
        view.put("totalRounds", 7);
        view.put("wins", state.wins());
        view.put("losses", state.losses());
        view.put("computerCard", state.computerCard() != null ? state.computerCard().toString() : null);
        view.put("computerDeckRemaining", state.computerDeck().size());
        view.put("finished", state.isFinished());
        view.put("winner", state.winnerPlayerId());
        return view;
    }

    @Override
    public Map<String, Object> toPrivateView(HighCardState state, String playerId) {
        List<String> hand = state.playerHand().stream().map(Card::toString).toList();

        Map<String, Object> view = new LinkedHashMap<>();
        view.put("playerId", playerId);
        view.put("hand", hand);
        return view;
    }
}

