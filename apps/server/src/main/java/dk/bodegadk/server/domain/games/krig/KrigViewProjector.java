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
        view.put("turnPlayerId", state.currentPlayerId());
        view.put("round", state.round());
        view.put("totalRounds", 5);
        view.put("scores", state.scores());

        Map<String, String> tableCards = new LinkedHashMap<>();
        for (String playerId : state.playerIds()) {
            Card card = state.tableCards().get(playerId);
            tableCards.put(playerId, card == null ? null : card.toString());
        }
        view.put("tableCards", tableCards);

        KrigState.BattleResult battle = state.lastBattle();
        if (battle == null) {
            view.put("lastBattle", null);
        } else {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("firstPlayerId", battle.firstPlayerId());
            result.put("firstCard", battle.firstCard());
            result.put("secondPlayerId", battle.secondPlayerId());
            result.put("secondCard", battle.secondCard());
            result.put("winnerPlayerId", battle.winnerPlayerId());
            result.put("outcome", battle.outcome());
            view.put("lastBattle", result);
        }

        return view;
    }

    @Override
    public Map<String, Object> toPrivateView(KrigState state, String playerId) {
        List<String> hand = state.hands().getOrDefault(playerId, List.of()).stream()
                .map(Card::toString)
                .toList();

        Map<String, Object> view = new LinkedHashMap<>();
        view.put("playerId", playerId);
        view.put("hand", hand);
        return view;
    }
}
