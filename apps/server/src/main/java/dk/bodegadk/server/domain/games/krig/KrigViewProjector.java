package dk.bodegadk.server.domain.games.krig;

import dk.bodegadk.server.domain.engine.ViewProjector;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class KrigViewProjector implements ViewProjector<KrigState> {
    @Override
    public Map<String, Object> toPublicView(KrigState state) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("players", state.playerIds());
        view.put("gamePhase", state.isFinished() ? "GAME_OVER" : "PLAYING");
        view.put("trickNumber", state.trickNumber());
        view.put("statusText", state.statusText());
        view.put("matchWinnerPlayerId", state.winnerPlayerId());
        view.put("rematchPlayerIds", List.copyOf(state.rematchPlayerIds()));
        view.put("readyPlayerIds", List.copyOf(state.readyPlayerIds()));
        view.put("warActive", state.warDepth() > 0);
        view.put("warDepth", state.warDepth());
        view.put("warPileSize", Math.max(0, state.centerPile().size() - state.currentFaceUpCards().size()));
        view.put("centerPileSize", state.centerPile().size());

        Map<String, Integer> drawPileCounts = new LinkedHashMap<>();
        for (String playerId : state.playerIds()) {
            drawPileCounts.put(playerId, state.drawPiles().getOrDefault(playerId, List.of()).size());
        }
        view.put("drawPileCounts", drawPileCounts);
        view.put("drawPileCountsBeforeTrick", state.drawPileCountsBeforeTrick());

        Map<String, Integer> stakeCardCounts = new LinkedHashMap<>();
        for (String playerId : state.playerIds()) {
            stakeCardCounts.put(playerId, 0);
        }
        for (KrigState.CenterCard centerCard : state.centerPile()) {
            if (!centerCard.faceUp()) {
                stakeCardCounts.put(centerCard.playerId(), stakeCardCounts.getOrDefault(centerCard.playerId(), 0) + 1);
            }
        }
        view.put("stakeCardCounts", stakeCardCounts);

        Map<String, String> currentFaceUpCards = new LinkedHashMap<>();
        for (String playerId : state.playerIds()) {
            Card card = state.currentFaceUpCards().get(playerId);
            currentFaceUpCards.put(playerId, card == null ? null : card.toString());
        }
        view.put("currentFaceUpCards", currentFaceUpCards);

        KrigState.TrickResult trick = state.lastTrick();
        if (trick == null) {
            view.put("lastTrick", null);
        } else {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("trickNumber", trick.trickNumber());
            result.put("firstPlayerId", trick.firstPlayerId());
            result.put("firstCard", trick.firstCard());
            result.put("secondPlayerId", trick.secondPlayerId());
            result.put("secondCard", trick.secondCard());
            result.put("winnerPlayerId", trick.winnerPlayerId());
            result.put("outcome", trick.outcome());
            result.put("cardsWon", trick.cardsWon());
            result.put("warDepth", trick.warDepth());
            view.put("lastTrick", result);
        }

        return view;
    }

    @Override
    public Map<String, Object> toPrivateView(KrigState state, String playerId) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("playerId", playerId);
        view.put("drawPileCount", state.drawPiles().getOrDefault(playerId, List.of()).size());
        return view;
    }
}
