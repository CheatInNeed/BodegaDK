package dk.bodegadk.server.domain.games.snyd;

import dk.bodegadk.server.domain.engine.ViewProjector;
import dk.bodegadk.server.domain.primitives.Card;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Maps raw SnydState into protocol-compatible public/private views.
 * Used by the server layer to build STATE_SNAPSHOT, PUBLIC_UPDATE, PRIVATE_UPDATE.
 */
public class SnydViewProjector implements ViewProjector<SnydState> {

    @Override
    public Map<String, Object> toPublicView(SnydState state) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("players", state.playerIds());
        view.put("turnPlayerId", state.currentPlayerId());
        view.put("nextPlayerId", state.nextPlayerId());
        view.put("pileCount", state.pileCount());
        view.put("playerCardCounts", state.cardCounts());

        SnydState.Claim claim = state.lastClaim();
        if (claim != null) {
            Map<String, Object> claimView = new LinkedHashMap<>();
            claimView.put("playerId", claim.playerId());
            claimView.put("claimRank", claim.claimRank());
            claimView.put("count", claim.count());
            view.put("lastClaim", claimView);
        } else {
            view.put("lastClaim", null);
        }

        return view;
    }

    @Override
    public Map<String, Object> toPrivateView(SnydState state, String playerId) {
        List<Card> hand = state.hands().getOrDefault(playerId, List.of());
        List<String> handCodes = hand.stream().map(Card::toString).toList();

        Map<String, Object> view = new LinkedHashMap<>();
        view.put("playerId", playerId);
        view.put("hand", handCodes);
        return view;
    }
}

