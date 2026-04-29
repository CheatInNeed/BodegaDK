package dk.bodegadk.server.domain.games.fem;

import dk.bodegadk.server.domain.engine.ViewProjector;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Maps raw FemState into protocol-compatible public/private views.
 */
public class FemViewProjector implements ViewProjector<FemState> {

    @Override
    public Map<String, Object> toPublicView(FemState state) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("players", state.playerIds());
        view.put("turnPlayerId", state.currentPlayerId());
        view.put("roundNumber", state.roundNumber());
        view.put("scores", state.scores());
        view.put("stockPileCount", state.stockPile().size());

        if (!state.discardPile().isEmpty()) {
            view.put("discardPileTop", state.discardPile().getLast().toString());
        } else {
            view.put("discardPileTop", null);
        }

        List<Map<String, Object>> meldViews = new ArrayList<>();
        for (FemState.Meld meld : state.melds()) {
            Map<String, Object> mv = new LinkedHashMap<>();
            mv.put("id", meld.id());
            mv.put("suit", meld.suit());
            mv.put("cards", meld.cards().stream().map(Card::toString).toList());
            mv.put("ownerId", meld.ownerPlayerId());

            Map<String, Integer> pointsPerPlayer = new LinkedHashMap<>();
            for (var entry : meld.contributedBy().entrySet()) {
                int pts = entry.getValue().stream().mapToInt(FemEngine::cardPoints).sum();
                if (pts > 0) pointsPerPlayer.put(entry.getKey(), pts);
            }
            mv.put("pointsPerPlayer", pointsPerPlayer);
            meldViews.add(mv);
        }
        view.put("melds", meldViews);
        view.put("playerCardCounts", state.cardCounts());
        view.put("phase", state.phase().name());
        view.put("firstRound", state.firstRound());

        if (state.winnerPlayerId() != null) {
            view.put("winnerPlayerId", state.winnerPlayerId());
        }

        return view;
    }

    @Override
    public Map<String, Object> toPrivateView(FemState state, String playerId) {
        List<Card> hand = state.hands().getOrDefault(playerId, List.of());
        List<String> handCodes = hand.stream().map(Card::toString).toList();

        Map<String, Object> view = new LinkedHashMap<>();
        view.put("playerId", playerId);
        view.put("hand", handCodes);

        int meldPoints = 0;
        for (FemState.Meld meld : state.melds()) {
            List<Card> contributed = meld.contributedBy().getOrDefault(playerId, List.of());
            for (Card c : contributed) {
                meldPoints += FemEngine.cardPoints(c);
            }
        }
        int handPoints = hand.stream().mapToInt(FemEngine::cardPoints).sum();
        view.put("projectedRoundScore", meldPoints - handPoints);

        return view;
    }
}
