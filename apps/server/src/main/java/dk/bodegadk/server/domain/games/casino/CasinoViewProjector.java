package dk.bodegadk.server.domain.games.casino;

import dk.bodegadk.server.domain.engine.ViewProjector;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class CasinoViewProjector implements ViewProjector<CasinoState> {
    @Override
    public Map<String, Object> toPublicView(CasinoState state) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("roomCode", state.roomCode());
        view.put("players", state.playerIds());
        view.put("dealerPlayerId", state.dealerPlayerId());
        view.put("turnPlayerId", state.started() && !state.isFinished() ? state.currentPlayerId() : null);
        view.put("tableStacks", state.tableStacks().stream().map(stack -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("stackId", stack.stackId());
            row.put("cards", List.copyOf(stack.cards()));
            row.put("total", stack.total());
            row.put("locked", stack.locked());
            row.put("topCard", stack.topCard());
            return row;
        }).toList());
        view.put("deckCount", state.deck().size());
        view.put("capturedCounts", new LinkedHashMap<>(state.capturedCounts()));
        view.put("lastCapturePlayerId", state.lastCapturePlayerId());
        view.put("started", state.started());
        view.put("finished", state.isFinished());
        view.put("rules", Map.of("valueMap", state.valueMap()));
        return view;
    }

    @Override
    public Map<String, Object> toPrivateView(CasinoState state, String playerId) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("playerId", playerId);
        view.put("hand", List.copyOf(state.hands().getOrDefault(playerId, List.of())));
        view.put("capturedCards", List.copyOf(state.capturedCards().getOrDefault(playerId, List.of())));
        return view;
    }
}
