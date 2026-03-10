package dk.bodegadk.server.domain.engine;

import java.util.Map;

/**
 * Separates what each player is allowed to see from the raw game state.
 * Keeps view/serialization logic out of the engine.
 *
 * <p>The server layer uses this to build STATE_SNAPSHOT, PUBLIC_UPDATE,
 * and PRIVATE_UPDATE protocol messages.
 *
 * @param <S> concrete GameState subclass
 */
public interface ViewProjector<S extends GameState> {

    /**
     * Build the public view — visible to ALL players.
     * Example: current turn, pile count, last claim, player card counts.
     */
    Map<String, Object> toPublicView(S state);

    /**
     * Build the private view for ONE specific player.
     * Example: their hand of cards.
     */
    Map<String, Object> toPrivateView(S state, String playerId);
}

